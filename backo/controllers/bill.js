const mongoose = require("mongoose");
const Bill = require("../models/bill");
const counter = require("../models/counter");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const Customer = require("../models/customer");
const PriceLevel = require("../models/Price_level");
const { attachHierarchy } = require("../utils/hierarchy");


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
        const { codes, customerId, redeemPoints = 0, priceLevel = "normal" } = req.body;

        if (!Array.isArray(codes) || codes.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No barcodes provided"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const invoiceNo = await getNextInvoiceNo(hierarchy.superAdminId);

        let subTotal = 0;
        let totalGST = 0;
        const items = [];

        for (const code of codes) {
            const qty = 1;

            const barcode = await Barcode.findOne({
                code: String(code).trim(),
                superAdminId: hierarchy.superAdminId
            });

            if (!barcode) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid barcode: ${code}`
                });
            }

            const product = await Product.findOne({
                _id: barcode.productId,
                superAdminId: hierarchy.superAdminId
            });




            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            if (Number(barcode.availableQty || 0) < qty) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} out of stock`
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
                    message: `Invalid selling price for barcode: ${code}`
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


                name: product.name,
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

            barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);

            barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);
            await barcode.save();

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
            paymentMethod: "cash",
            paymentStatus: "paid",

            cashier: req.user.userId || req.user.id,
            createdBy: req.user.userId || req.user.id,

            role: req.user.role,
            ...hierarchy
        });

        return res.status(201).json({
            success: true,
            message: "Bill generated successfully",
            data: {
                billId: bill._id,
                invoiceNo: bill.invoiceNo,
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
}

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
            customerId: { $in: customerIds }
        })
            .populate("customerId", "name phone customerId id")
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Customer bills fetched successfully",
            count: bills.length,
            data: bills
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


