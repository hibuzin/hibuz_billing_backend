const mongoose = require("mongoose");
const Bill = require("../models/bill");
const counter = require("../models/counter");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const Customer = require("../models/customer");
const PriceLevel = require("../models/Price_level");
const DuePayment = require("../models/due_payment");
const { attachHierarchy } = require("../utils/hierarchy");
const CashRegister = require("../models/cashRegister");
const AuditLog = require("../models/audit_log");


const getNextInvoiceNo = async (superAdminId) => {
    const result = await counter.findOneAndUpdate(
        { name: `invoice_${superAdminId}` },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return `INV-${String(result.seq).padStart(5, "0")}`;
};


exports.createBill = async (req, res) => {
    try {
        const {
            codes,
            items: billItems = [],
            customerId,
            redeemPoints = 0,
            priceLevel = "normal",

            paymentStatus = "paid",
            paymentMethod = "cash",

            payments = [],
            dueDate
        } = req.body;

        if (
            (!Array.isArray(codes) || codes.length === 0) &&
            (!Array.isArray(billItems) || billItems.length === 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "No products provided"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const invoiceNo = await getNextInvoiceNo(hierarchy.superAdminId);

        let subTotal = 0;
        let totalGST = 0;
        const items = [];

        const gstAuditItems = [];

        for (const code of codes || []) {
            const qty = 1;
            const searchValue = String(code).trim();

            let barcode = await Barcode.findOne({
                code: searchValue,
                superAdminId: hierarchy.superAdminId,
                availableQty: { $gte: qty }
            });

            let product = null;

            if (barcode) {
                product = await Product.findOne({
                    _id: barcode.productId,
                    superAdminId: hierarchy.superAdminId
                });
            }

            if (!barcode || !product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found for: ${searchValue}`
                });
            }

            let price = Number(barcode.sellingPrice || 0);
            const gstRate = Number(barcode.gstRate || product.gstRate || 0);

            const taxableAmount = price * qty;
            const gstAmount = Number(((taxableAmount * gstRate) / 100).toFixed(2));
            const finalPrice = Number((taxableAmount + gstAmount).toFixed(2));

            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({
                productId: product._id,
                barcodeId: barcode._id,
                barcode: barcode.code,
                productName: product.name || "",
                name: product.name || "",
                brand: product.brand || "",
                flavor: barcode.flavor || "",
                litters: barcode.litters || "",
                qty,
                mrp: barcode.mrp || 0,
                price,
                gstRate,
                gstAmount,
                finalPrice
            });

            if (gstRate > 0 && gstAmount > 0) {
                gstAuditItems.push({
                    productId: product._id,
                    productName: product.name || "",
                    barcode: barcode.code,
                    qty,
                    price,
                    gstRate,
                    gstAmount,
                    finalPrice
                });
            }

            barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);
            await barcode.save();

            await Product.updateOne(
                { _id: product._id, superAdminId: hierarchy.superAdminId },
                { $inc: { stock: -qty } }
            );
        }



        for (const billItem of billItems) {
            const qty = Number(billItem.qty || 1);

            if (isNaN(qty) || qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity"
                });
            }

            const product = await Product.findOne({
                _id: billItem.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const barcode = await Barcode.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId,
                availableQty: { $gte: qty }
            });

            if (!barcode) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} stock not available`
                });

            }

            let price = Number(barcode.sellingPrice || 0);

            const productPriceLevel = await PriceLevel.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId,
                isActive: true
            });

            if (productPriceLevel) {

                if (
                    priceLevel === "manual" &&
                    productPriceLevel.pricingType === "manual"
                ) {

                    price = Number(productPriceLevel.manualPrice || price);

                } else if (
                    priceLevel === "auto" &&
                    productPriceLevel.pricingType === "auto"
                ) {

                    const profitPercent =
                        Number(productPriceLevel.autoPricing?.profitPercent || 0);

                    const baseOn =
                        productPriceLevel.autoPricing?.baseOn || "costPrice";

                    const basePrice =
                        baseOn === "mrp"
                            ? Number(barcode.mrp || 0)
                            : Number(barcode.costPrice || 0);

                    price =
                        basePrice +
                        (basePrice * profitPercent / 100);

                } else if (
                    priceLevel === "slab" &&
                    productPriceLevel.pricingType === "slab"
                ) {

                    const slab = productPriceLevel.slabs.find((s) => {

                        const minOk = qty >= Number(s.minQty || 0);

                        const maxOk =
                            s.maxQty === null ||
                            qty <= Number(s.maxQty);

                        return minOk && maxOk;
                    });

                    if (slab) {
                        price = Number(slab.price || price);
                    }
                }
            }


            const gstRate = Number(barcode.gstRate || product.gstRate || 0);

            if (price <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid selling price for product: ${product.name}`
                });

            }

            const taxableAmount = price * qty;
            const gstAmount = Number(((taxableAmount * gstRate) / 100).toFixed(2));
            const finalPrice = Number((taxableAmount + gstAmount).toFixed(2));


            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({



                productId: product._id,
                barcodeId: barcode._id,
                barcode: barcode.code,


                productName: product.name || "",
                name: product.name || "",
                brand: product.brand || "",
                flavor: barcode.flavor || "",
                litters: barcode.litters || "",

                qty,
                mrp: barcode.mrp || 0,
                price,
                gstRate,
                gstAmount,
                finalPrice
            });


            if (gstRate > 0 && gstAmount > 0) {
                gstAuditItems.push({
                    productId: product._id,
                    productName: product.name || "",
                    barcode: barcode.code,
                    qty,
                    price,
                    gstRate,
                    gstAmount,
                    finalPrice
                });
            }


            barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);

            await barcode.save();

            const availableStock =
                Number(product.stock || 0) -
                Number(product.reservedStock || 0);

            if (availableStock < qty) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} stock not available`
                });
            }

            const stockUpdate = await Product.updateOne(
                {
                    _id: product._id,
                    superAdminId: hierarchy.superAdminId,
                    stock: { $gte: qty }
                },
                {
                    $inc: {
                        stock: -qty
                    }
                }
            );

            if (stockUpdate.modifiedCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} stock update failed`
                });
            }
        }

        let discount = 0;
        let customer = null;

        if (customerId) {
            customer = await Customer.findOne({
                customerId,
                superAdminId: hierarchy.superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }

            if (Number(redeemPoints) > 0) {
                if (customer.loyaltyPoints < Number(redeemPoints)) {
                    return res.status(400).json({
                        success: false,
                        message: "Not enough loyalty points"
                    });
                }

                discount = Number(redeemPoints);
                customer.loyaltyPoints -= discount;
            }
        }

        const grandTotal = Number((subTotal + totalGST - discount).toFixed(2));

        let finalPayments = [];

        if (paymentStatus === "due") {
            finalPayments = [];
        } else if (paymentMethod === "split") {
            finalPayments = payments;
        } else {
            finalPayments = [
                {
                    method: paymentMethod,
                    amount: grandTotal
                }
            ];

        }

        const allowedMethods = ["cash", "upi", "card"];

        for (const pay of finalPayments) {
            if (!allowedMethods.includes(pay.method)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment method"
                });
            }

            if (Number(pay.amount || 0) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment amount"
                });
            }
        }

        const totalPaid = Number(
            finalPayments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0).toFixed(2)
        );

        let pendingAmount = 0;

        if (paymentStatus === "paid") {
            if (totalPaid !== grandTotal) {
                return res.status(400).json({
                    success: false,
                    message: "Paid amount must equal grand total"
                });
            }
        }

        if (paymentStatus === "partial") {
            if (!customer) {
                return res.status(400).json({
                    success: false,
                    message: "Customer required for partial payment"
                });
            }

            if (totalPaid <= 0 || totalPaid >= grandTotal) {
                return res.status(400).json({
                    success: false,
                    message: "Partial paid amount must be less than grand total"
                });
            }

            pendingAmount = Number((grandTotal - totalPaid).toFixed(2));
        }

        if (paymentStatus === "due") {
            if (!customer) {
                return res.status(400).json({
                    success: false,
                    message: "Customer required for due payment"
                });
            }

            finalPayments = [];
            pendingAmount = grandTotal;
        }


        const earnedPoints = Math.floor(grandTotal / 100);

        if (customer) {
            customer.loyaltyPoints += earnedPoints;
            customer.totalSpent += grandTotal;
            await customer.save();
        }


        const bill = await Bill.create({
            items,
            summary: {
                subTotal,
                totalGST,
                discount,
                grandTotal
            },
            invoiceNo,
            customerId: customer ? customer._id : null,

            paymentMethod: finalPayments.length > 1 ? "split" : finalPayments[0]?.method || "due",
            paymentStatus,
            payments: finalPayments,

            cashier: req.user.userId || req.user.id,
            createdBy: req.user.userId || req.user.id,

            role: req.user.role,
            ...hierarchy
        });

        const cashRegister = await CashRegister.findOne({
            superAdminId: hierarchy.superAdminId,
            status: "open"
        });

        if (cashRegister && finalPayments.length > 0) {
            for (const pay of finalPayments) {
                const amount = Number(pay.amount || 0);

                if (pay.method === "cash") {
                    cashRegister.cashSales += amount;
                }

                if (pay.method === "upi") {
                    cashRegister.upiSales += amount;
                }

                if (pay.method === "card") {
                    cashRegister.cardSales += amount;
                }
            }

            cashRegister.expectedCash =
                cashRegister.openingAmount +
                cashRegister.cashSales -
                cashRegister.cashOut;

            await cashRegister.save();
        }

        if (gstAuditItems.length > 0) {
            await AuditLog.create({
                userId: req.user.userId || req.user.id,
                role: req.user.role,
                module: "GST",
                action: "CREATE",
                documentId: bill._id,
                oldData: null,
                newData: {
                    invoiceNo: bill.invoiceNo,
                    customerId: customer ? customer._id : null,
                    gstItems: gstAuditItems,
                    totalGST,
                    grandTotal
                },
                ...hierarchy
            });
        }


        if (paymentStatus === "partial" || paymentStatus === "due") {
            await DuePayment.create({
                customerId: customer._id,
                billId: bill._id,
                totalAmount: grandTotal,
                paidAmount: totalPaid,
                pendingAmount,
                paymentStatus: paymentStatus,
                dueDate,
                createdBy: req.user.userId || req.user.id,
                ...hierarchy
            });
        }


        return res.status(201).json({
            success: true,
            message: "Bill generated successfully",
            data: {
                billId: bill._id,
                invoiceNo: bill.invoiceNo,
                paymentMethod: bill.paymentMethod,
                paymentStatus: bill.paymentStatus,
                payments: finalPayments,
                paidAmount: totalPaid,
                pendingAmount,
                items,
                summary: bill.summary,
                loyalty: {
                    used: discount,
                    earned: earnedPoints,
                    remaining: customer ? customer.loyaltyPoints : 0
                }
            }
        });

    } catch (error) {
        console.error("BILL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.searchProductsForBill = async (req, res) => {
    try {
        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search is required"
            });
        }

        const searchValue = search.trim();
        const hierarchy = attachHierarchy(req.user);

        
        const products = await Product.find({
            superAdminId: hierarchy.superAdminId,
            name: { $regex: searchValue, $options: "i" },
            stock: { $gt: 0 }
        }).limit(20);

        const productData = await Promise.all(
            products.map(async (p) => {
                const barcode = await Barcode.findOne({
                    productId: p._id,
                    superAdminId: hierarchy.superAdminId,
                    availableQty: { $gt: 0 }
                });

                return {
                    productId: p._id,
                    productName: p.name,
                    brand: p.brand,
                    barcode: barcode?.code || "",
                    qty: 1,
                    stock: p.stock,

                    mrp: barcode?.mrp || 0,
                    sellingPrice: barcode?.sellingPrice || 0,
                    costPrice: barcode?.costPrice || 0,

                    flavor: barcode?.flavor || "",
                    litters: barcode?.litters || "",
                    kg: barcode?.kg || "",

                    gstRate: barcode?.gstRate || p.gstRate || 0
                };
            })
        );


        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            code: { $regex: searchValue, $options: "i" },
            availableQty: { $gt: 0 }
        }).populate("productId");

        const barcodeData = barcodes
            .filter((b) => b.productId)
            .map((b) => ({
                productId: b.productId._id,
                productName: b.productId.name,
                brand: b.productId.brand,
                barcode: b.code,
                qty: 1,
                stock: b.productId.stock,
                mrp: b.mrp || 0,
                flavor: b.flavor || "",
                litters: b.litters || "",
                kg: b.kg || "",
                gstRate: b.gstRate || b.productId.gstRate || 0
            }));


        const merged = [...barcodeData, ...productData];

        const uniqueData = merged.filter(
            (item, index, self) =>
                index === self.findIndex(
                    (x) =>
                        String(x.productId) === String(item.productId) &&
                        x.barcode === item.barcode
                )
        );

        return res.status(200).json({
            success: true,
            count: uniqueData.length,
            data: uniqueData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.searchCustomerBills = async (req, res) => {
    try {

        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search value is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const conditions = [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } }
        ];

        if (!isNaN(search)) {
            conditions.push({ customerId: Number(search) });
            conditions.push({ id: Number(search) });
        }

        const customers = await Customer.find({
            superAdminId: hierarchy.superAdminId,
            $or: conditions
        });

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const customerIds = customers.map(c => c._id);

        const bills = await Bill.find({
            superAdminId: hierarchy.superAdminId,
            $or: [
                { customerId: { $in: customerIds } },
                { invoiceNo: { $regex: search, $options: "i" } }
            ]
        })
            .populate("customerId", "name phone customerId id")
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Customer bills fetched successfully",
            count: bills.length,
            data: bills.map(bill => ({
                _id: bill._id,
                invoiceNo: bill.invoiceNo,
                customer: bill.customerId,
                items: bill.items,
                summary: bill.summary,
                paymentStatus: bill.paymentStatus,
                paymentMethod: bill.paymentMethod,
                createdBy: bill.createdBy,
                createdAt: bill.createdAt
            }))
        });

    } catch (error) {

        console.error("SEARCH CUSTOMER BILL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



exports.getBills = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const bills = await Bill.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "name phone customerId")
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Bills fetched successfully",
            count: bills.length,
            data: bills
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}

exports.salescheck = async (req, res) => {
    try {
        const { type = "today" } = req.query;
        const hierarchy = attachHierarchy(req.user);

        const now = new Date();
        let startDate;

        if (type === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (type === "week") {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (type === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (type === "year") {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid type. Use today, week, month, or year"
            });
        }

        const sales = await Bill.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    createdAt: { $gte: startDate, $lte: now },
                    paymentStatus: "paid"
                }
            },
            {
                $group: {
                    _id: null,
                    totalBills: { $sum: 1 },
                    totalSales: { $sum: "$summary.grandTotal" },
                    totalGST: { $sum: "$summary.totalGST" },
                    totalDiscount: { $sum: "$summary.discount" },
                    subTotal: { $sum: "$summary.subTotal" }
                }
            }
        ]);

        const result = sales[0] || {
            totalBills: 0,
            totalSales: 0,
            totalGST: 0,
            totalDiscount: 0,
            subTotal: 0
        };

        return res.status(200).json({
            success: true,
            message: `${type} sales fetched successfully`,
            filter: {
                type,
                from: startDate,
                to: now
            },
            data: result
        });

    } catch (error) {
        console.error("SALES CHECK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}


exports.cashierWiseSales = async (req, res) => {
    try {
        const { type = "today" } = req.query;
        const hierarchy = attachHierarchy(req.user);

        const now = new Date();
        let startDate;

        if (type === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (type === "week") {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (type === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (type === "year") {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid type. Use today, week, month, or year"
            });
        }

        const sales = await Bill.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    createdAt: { $gte: startDate, $lte: now },
                    paymentStatus: "paid"
                }
            },
            {
                $group: {
                    _id: "$createdBy",
                    totalBills: { $sum: 1 },
                    subTotal: { $sum: "$summary.subTotal" },
                    totalGST: { $sum: "$summary.totalGST" },
                    totalDiscount: { $sum: "$summary.discount" },
                    totalSales: { $sum: "$summary.grandTotal" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "cashier"
                }
            },
            {
                $unwind: {
                    path: "$cashier",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    cashierId: "$_id",
                    cashierName: { $ifNull: ["$cashier.name", "Unknown"] },
                    cashierEmail: { $ifNull: ["$cashier.email", ""] },
                    totalBills: 1,
                    subTotal: 1,
                    totalGST: 1,
                    totalDiscount: 1,
                    totalSales: 1
                }
            },
            {
                $sort: { totalSales: -1 }
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Cashier wise sales fetched successfully",
            filter: {
                type,
                from: startDate,
                to: now
            },
            data: sales
        });

    } catch (error) {
        console.error("CASHIER SALES ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}


exports.getBillById = async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);

        if (!bill) {
            return errorResponse(res, "Bill not found", 404);
        }


        let subTotal = 0;
        let totalGST = 0;

        const items = bill.items.map(item => {
            const gstAmount = (item.price * item.gst) / 100;
            const finalPrice = item.price + gstAmount;

            subTotal += item.price;
            totalGST += gstAmount;

            return {
                name: item.name,
                price: item.price,
                gst: item.gst,
                gstAmount,
                finalPrice
            };
        });

        const grandTotal = subTotal + totalGST;

        return successResponse(res, {
            billId: bill._id,
            items,
            summary: {
                subTotal,
                totalGST,
                grandTotal
            },
            createdAt: bill.createdAt
        }, "Bill fetched successfully");

    } catch (err) {
        return errorResponse(res, "Server error", 500);
    }
}


