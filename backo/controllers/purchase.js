const mongoose = require("mongoose");

const Purchase = require("../models/purchase");
const Product = require("../models/product");
const ProductPriceHistory = require("../models/product_price_history");
const Supplier = require("../models/supplier");
const Barcode = require("../models/barcode");
const Counter = require("../models/counter");
const PriceLevel = require("../models/price_level");
const { attachHierarchy } = require("../utils/hierarchy");

const getNextPurchaseInvoiceNo = async (superAdminId) => {
    const counter = await Counter.findOneAndUpdate(
        { name: `purchase_invoice_${superAdminId}` },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    return `PUR-${String(counter.seq).padStart(5, "0")}`;
};



exports.calculatePurchase = async (req, res) => {
    try {
        const { items, paidAmount = 0, supplierBillAmount } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Items are required"
            });
        }

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        let totalAmount = 0;
        let totalGrossAmount = 0;
        let totalTaxAmount = 0;

        const calculatedItems = items.map((item, index) => {
            const qty = Number(item.qty);
            const freeQty = Number(item.freeQty || 0);
            const totalStockQty = qty + freeQty;

            const netcost = Number(item.netcost || item.purchasePrice || item.netCost);
            const mrp = Number(item.mrp);
            const sellingPrice = Number(item.sellingPrice || mrp);
            const taxPercentage = Number(item.gst || item.gstRate || item.taxPercentage || 0);

            const discountPercent = Number(item.discountPercent || 0);
            const discountAmountInput = Number(item.discountAmount || 0);
            const isGstIncluded = item.isGstIncluded !== false;

            if (isNaN(qty) || qty <= 0) {
                throw new Error(`Invalid quantity at item ${index + 1}`);
            }

            if (isNaN(netcost) || netcost < 0) {
                throw new Error(`Invalid purchase price at item ${index + 1}`);
            }

            if (isNaN(mrp) || mrp <= 0) {
                throw new Error(`Invalid MRP at item ${index + 1}`);
            }

            const netAmount = round2(netcost * qty);
            const grossAmount = round2(qty * netcost);

            const percentDiscountAmount = round2(
                grossAmount * discountPercent / 100
            );

            const discountAmount = round2(
                percentDiscountAmount + discountAmountInput
            );

            const amountAfterDiscount = round2(grossAmount - discountAmount);

            let amount = 0;
            let taxAmount = 0;
            let totalCostWithGST = 0;

            if (isGstIncluded) {
                totalCostWithGST = amountAfterDiscount;

                taxAmount = round2(
                    amountAfterDiscount * taxPercentage / 100
                );

                amount = round2(
                    amountAfterDiscount - taxAmount
                );
            } else {
                amount = amountAfterDiscount;

                taxAmount = round2(
                    amount * taxPercentage / 100
                );

                totalCostWithGST = round2(
                    amount + taxAmount
                );
            }

            totalGrossAmount = round2(totalGrossAmount + amount);
            totalTaxAmount = round2(totalTaxAmount + taxAmount);
            totalAmount = round2(totalAmount + totalCostWithGST);

            const Rate = totalStockQty > 0
                ? round2(amount / totalStockQty)
                : 0;

            const profitAmount = round2(sellingPrice - netcost);

            const profitPercent = sellingPrice > 0
                ? round2((profitAmount / sellingPrice) * 100)
                : 0;

            const roiPercent = netcost > 0
                ? round2((profitAmount / netcost) * 100)
                : 0;

            return {

                productId: item.productId || "",

                productName:
                    item.productName ||
                    item.itemName ||
                    "",

                qty,
                freeQty,
                totalStockQty,

                discountPercent,
                discountAmount,

                amount,
                totalCostWithGST,
                isGstIncluded,

                profitPercent,
                roiPercent,

                taxPercentage,
                netcost,
                netAmount,
                Rate,
                profitAmount,
                mrp,
                sellingPrice,
                taxAmount,

                barcode: item.barcode || "",
                receivedQty: totalStockQty,
                pendingQty: 0
            };
        });

        const finalSupplierBillAmount = Number(supplierBillAmount || totalAmount);
        const finalPaidAmount = Number(paidAmount || 0);
        const balanceAmount = round2(finalSupplierBillAmount - finalPaidAmount);

        return res.status(200).json({
            success: true,
            message: "Purchase calculation successful",
            data: {
                totalAmount: round2(totalAmount),
                totalGrossAmount: round2(totalGrossAmount),
                totalTaxAmount: round2(totalTaxAmount),
                supplierBillAmount: round2(finalSupplierBillAmount),
                paidAmount: round2(finalPaidAmount),
                balanceAmount,
                items: calculatedItems
            }
        });

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
};


exports.createPurchase = async (req, res) => {
    try {
        const { supplierId, items, invoiceDate, supplierBillAmount, paidAmount } = req.body;

        if (!supplierId || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Supplier and items are required"
            });
        }



        if (!invoiceDate) {
            return res.status(400).json({
                success: false,
                message: "Invoice date is required"
            });
        }

        let finalInvoiceDate = new Date(invoiceDate);

        if (invoiceDate.includes(".")) {
            const [day, month, year] = invoiceDate.split(".");
            finalInvoiceDate = new Date(`${year}-${month}-${day}`);
        }

        if (isNaN(finalInvoiceDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid invoice date format. Use YYYY-MM-DD or DD.MM.YYYY"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const invoiceNo = await getNextPurchaseInvoiceNo(hierarchy.superAdminId);

        const supplier = await Supplier.findOne({
            _id: supplierId,
            superAdminId: hierarchy.superAdminId
        });



        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        let totalGrossAmount = 0;
        let totalTaxAmount = 0;
        let totalAmount = 0;

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        const processedItems = [];

        for (const item of items) {
            const productId = item.productId;


            const mrp = Number(item.mrp);
            const qty = Number(item.qty);
            const freeQty = Number(item.freeQty || 0);

            const netcost = Number(item.netcost || item.netCost);
            const netAmount = round2(netcost * qty);

            const sellingPrice = Number(item.sellingPrice || mrp);

            const priceLevel = item.priceLevel || null;
            let barcode = String(item.barcode || item.code || "").trim();

            if (!productId) {
                return res.status(400).json({
                    success: false,
                    message: "Product id is required"
                });
            }

            if (isNaN(qty) || qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity"
                });
            }

            if (isNaN(freeQty) || freeQty < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid free quantity"
                });
            }

            if (isNaN(netcost) || netcost < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid net cost"
                });
            }

            if (isNaN(mrp) || mrp <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid MRP"
                });
            }

            const product = await Product.findOne({
                _id: productId,
                superAdminId: hierarchy.superAdminId
            }).populate("categoryId", "name");

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const purchaseUnit = item.unit
                ? String(item.unit).trim().toLowerCase()
                : product.unit || "pcs";

            const purchaseUnitValue = item.unitValue
                ? Number(item.unitValue)
                : Number(product.unitValue || 1);

            if (!["pcs", "kg"].includes(purchaseUnit)) {
                return res.status(400).json({
                    success: false,
                    message: "Unit must be pcs or kg"
                });
            }

            if (isNaN(purchaseUnitValue) || purchaseUnitValue <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid unitValue is required"
                });
            }

            if (!barcode) {
                const productBarcode = await Barcode.findOne({
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId
                }).sort({ createdAt: -1 });

                if (productBarcode) {
                    barcode = productBarcode.code;
                }
            }

            const productMrp = Number(product.mrp || 0);

            if (mrp !== productMrp) {
                return res.status(400).json({
                    success: false,
                    message: "Selected MRP not found in product"
                });
            }


            const taxPercentage = Number(product.gstRate || 0);

            const discountPercent = Number(
                item.discountPercent || item.disPercent || 0
            );

            const manualDiscountAmount = Number(
                item.discountAmount || item.disAmount || 0
            );

            const isGstIncluded = item.isGstIncluded !== false;

            const totalStockQty = qty + freeQty;

            const grossAmount = round2(qty * netcost);

            const percentDiscountAmount = round2(
                grossAmount * discountPercent / 100
            );

            const discountAmount = round2(
                percentDiscountAmount + manualDiscountAmount
            );

            if (discountAmount > grossAmount) {
                return res.status(400).json({
                    success: false,
                    message: "Discount amount cannot be greater than gross amount"
                });
            }

            const amountAfterDiscount = round2(grossAmount - discountAmount);

            let amount = 0;
            let taxAmount = 0;
            let totalCostWithGST = 0;

            if (isGstIncluded) {
                totalCostWithGST = amountAfterDiscount;

                taxAmount = round2(
                    amountAfterDiscount * taxPercentage / 100
                );

                amount = round2(
                    amountAfterDiscount - taxAmount
                );
            } else {
                amount = amountAfterDiscount;
                taxAmount = round2(amount * taxPercentage / 100);
                totalCostWithGST = round2(amount + amount);
            }

            totalGrossAmount = round2(
                totalGrossAmount + amount
            );

            totalTaxAmount = round2(
                totalTaxAmount + taxAmount
            );

            const Rate = totalStockQty > 0
                ? round2(amount / totalStockQty)
                : 0;

            const profitAmount = round2(sellingPrice - netcost);

            const profitPercent = sellingPrice > 0
                ? round2((profitAmount / sellingPrice) * 100)
                : 0;

            const roiPercent = netcost > 0
                ? round2((profitAmount / netcost) * 100)
                : 0;


            if (barcode) {
                const existingBarcode = await Barcode.findOne({
                    code: barcode,
                    superAdminId: hierarchy.superAdminId
                });

                if (
                    existingBarcode &&
                    String(existingBarcode.productId) !== String(product._id)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Barcode already exists for another product"
                    });
                }

                await Barcode.findOneAndUpdate(
                    {
                        productId: product._id,
                        code: barcode,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $set: {
                            productId: product._id,
                            code: barcode,

                            mrp: item.mrp || product.mrp || 0,
                            costPrice: item.costPrice || product.costPrice || 0,
                            sellingPrice: item.sellingPrice || product.sellingPrice || 0,
                            gstRate: product.gstRate || 0,

                            unit: purchaseUnit,
                            unitValue: purchaseUnitValue,

                            isSold: false,

                            ...hierarchy,
                            createdBy: req.user.userId
                        },
                        $inc: {

                            qty: totalStockQty,
                            availableQty: totalStockQty

                        }
                    },
                    {
                        upsert: true,
                        new: true
                    }

                )
            };


            if (priceLevel) {
                await PriceLevel.findOneAndUpdate(
                    {
                        productId: product._id,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        productId: product._id,

                        pricingType: priceLevel.pricingType,

                        manualPrice: priceLevel.manualPrice || 0,

                        autoPricing: priceLevel.autoPricing || {
                            baseOn: "netcost",
                            profitPercent: 0
                        },

                        slabs: priceLevel.slabs || [],

                        ...hierarchy,
                        createdBy: req.user.userId,
                        isActive: true
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true
                    }
                );
            }

            await Product.updateOne(
                {
                    _id: product._id,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: totalStockQty
                    }
                }
            );


            totalAmount = round2(totalAmount + totalCostWithGST);

            processedItems.push({
                productId: product._id,
                productName: product.name || "",

                description: item.description
                    ? String(item.description).trim()
                    : product.description || "",

                hsnId: product.hsnId || null,
                hsnCode: product.hsnCode || "",

                categoryId: product.categoryId?._id,
                categoryName: product.categoryId?.name || "",

                taxPercentage,
                taxAmount,

                discountPercent,
                discountAmount,
                amount,
                totalCostWithGST,
                isGstIncluded,

                freeQty,
                totalStockQty,

                qty,
                netcost,
                netAmount,
                Rate,
                mrp,
                barcode,

                unit: purchaseUnit,
                unitValue: purchaseUnitValue,

                sellingPrice,
                priceLevel,


                profitAmount,
                profitPercent,
                roiPercent,

                receivedQty: totalStockQty,
                pendingQty: 0
            });
        }

        const finalSupplierBillAmount = Number(supplierBillAmount || totalAmount);
        const firstPaidAmount = Number(paidAmount || 0);

        if (firstPaidAmount > finalSupplierBillAmount) {
            return res.status(400).json({
                success: false,
                message: "Paid amount cannot be greater than supplier bill amount"
            });
        }

        const balanceAmount = round2(
            finalSupplierBillAmount - firstPaidAmount
        );

        const purchase = await Purchase.create({
            supplierId,
            supplierName: supplier.supplierName || "",
            supplierEmail: supplier.email || "",
            invoiceNo,
            invoiceDate: finalInvoiceDate,
            items: processedItems,
            totalAmount,

            supplierBillAmount: finalSupplierBillAmount,
            paidAmount: firstPaidAmount,
            balanceAmount,

            paymentHistory: firstPaidAmount > 0 ? [
                {
                    amount: firstPaidAmount,
                    note: "Initial payment"
                }
            ] : [],


            ...hierarchy,
            createdBy: req.user.userId
        });

        const responsePurchase = await Purchase.findById(purchase._id)
            .populate("items.productId", "name brand");

        return res.status(201).json({
            success: true,
            message: "Purchase created successfully",

            data: {
                _id: responsePurchase._id,

                supplier: {
                    id: String(supplier._id),

                    name: String(supplier.supplierName || ""),

                    mobile: String(supplier.mobile || ""),

                    email: String(supplier.email || "")
                },

                invoiceNo: responsePurchase.invoiceNo,

                invoiceDate: responsePurchase.invoiceDate
                    ? new Date(responsePurchase.invoiceDate)
                        .toLocaleDateString("en-GB")
                        .replace(/\//g, "-")
                    : "",

                totalAmount: round2(responsePurchase.totalAmount),
                totalGrossAmount: round2(totalGrossAmount),

                supplierBillAmount: round2(responsePurchase.supplierBillAmount),
                paidAmount: round2(responsePurchase.paidAmount),
                balanceAmount: round2(responsePurchase.balanceAmount),
                paymentStatus: responsePurchase.paymentStatus,

                items: responsePurchase.items.map((item) => ({

                    freeQty: item.freeQty || 0,
                    totalStockQty: item.totalStockQty || 0,


                    discountPercent: item.discountPercent || 0,
                    discountAmount: round2(item.discountAmount || 0),

                    amount: round2(item.amount || 0),
                    totalCostWithGST: round2(item.totalCostWithGST || 0),
                    isGstIncluded: item.isGstIncluded,


                    profitPercent: round2(item.profitPercent || 0),
                    roiPercent: round2(item.roiPercent || 0),


                    _id: item._id,

                    productId: item.productId?._id,

                    productName: item.productId?.name || "",

                    description:
                        item.description || "",



                    hsnCode:
                        item.hsnCode || "",

                    categoryName:
                        item.categoryName || "",

                    taxPercentage: item.taxPercentage || 0,

                    categoryName:
                        item.categoryName || "",



                    qty:
                        item.qty || 0,

                    netcost:
                        round2(item.netcost || 0),

                    netAmount: round2(item.netAmount || 0),

                    Rate:
                        round2(item.Rate || 0),

                    unit: item.unit || "",
                    unitValue: item.unitValue || 1,

                    profitAmount:
                        round2(item.profitAmount || 0),

                    mrp:
                        item.mrp || 0,

                    sellingPrice:
                        item.sellingPrice || 0,

                    taxAmount: round2(item.taxAmount || 0),

                    priceLevel:
                        item.priceLevel || null,

                    barcode:
                        item.barcode || "",

                    receivedQty:
                        item.receivedQty || 0,

                    pendingQty:
                        item.pendingQty || 0
                }))
            }
        });


    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getProductForPurchase = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product id"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const product = await Product.findOne({
            _id: productId,
            superAdminId: hierarchy.superAdminId
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        let barcode = String(item.barcode || item.code || "").trim();

        if (!barcode) {
            const productBarcode = await Barcode.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId
            }).sort({ createdAt: -1 });

            if (productBarcode) {
                barcode = productBarcode.code;
            }
        }

        const productMrp = Number(product.mrp || 0);

        if (mrp !== productMrp) {
            return res.status(400).json({
                success: false,
                message: "Selected MRP not found in product"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                productId: product._id,
                productName: product.name,
                brand: product.brand,
                categoryId: product.categoryId,
                categoryName: product.categoryName,
                hsnCode: product.hsnCode,
                taxRate: product.gstRate,
                mrp: product.mrp,
                costPrice: product.costPrice,
                sellingPrice: product.sellingPrice,

                kg: product.kg,
                currentStock: product.stock
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getAllSupplierBalances = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const balances = await Purchase.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    balanceAmount: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: "$supplierId",
                    totalBillAmount: { $sum: "$supplierBillAmount" },
                    totalPaidAmount: { $sum: "$paidAmount" },
                    totalBalanceAmount: { $sum: "$balanceAmount" },
                    pendingBills: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "suppliers",
                    localField: "_id",
                    foreignField: "_id",
                    as: "supplier"
                }
            },
            {
                $unwind: "$supplier"
            },
            {
                $project: {
                    _id: 0,
                    supplierId: "$_id",
                    supplierName: "$supplier.supplierName",
                    mobile: "$supplier.mobile",
                    email: "$supplier.email",
                    totalBillAmount: 1,
                    totalPaidAmount: 1,
                    totalBalanceAmount: 1,
                    pendingBills: 1
                }
            },
            {
                $sort: {
                    totalBalanceAmount: -1
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            count: balances.length,
            data: balances
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.quickSearchPurchases = async (req, res) => {
    try {
        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search value is required"
            });
        }

        const searchValue = String(search).trim();
        const hierarchy = attachHierarchy(req.user);

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId,
            $or: [
                { invoiceNo: { $regex: searchValue, $options: "i" } },
                { supplierName: { $regex: searchValue, $options: "i" } },
                { supplierEmail: { $regex: searchValue, $options: "i" } },
                { "items.productName": { $regex: searchValue, $options: "i" } },
                { "items.barcode": { $regex: searchValue, $options: "i" } }
            ]
        })
            .populate("supplierId", "supplierName mobile email")
            .populate("items.productId", "name brand")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: purchases.length,
            data: purchases
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getSupplierBalanceBills = async (req, res) => {
    try {
        const { supplierId } = req.params;

        const hierarchy = attachHierarchy(req.user);

        const purchases = await Purchase.find({
            supplierId,
            superAdminId: hierarchy.superAdminId,
            balanceAmount: { $gt: 0 }
        })
            .populate("supplierId", "supplierName mobile email")
            .sort({ createdAt: -1 });

        const totalBalance = purchases.reduce(
            (sum, purchase) => sum + Number(purchase.balanceAmount || 0),
            0
        );

        return res.status(200).json({
            success: true,
            supplier: {
                id: purchases[0]?.supplierId?._id || supplierId,
                name: purchases[0]?.supplierId?.supplierName || "",
                mobile: purchases[0]?.supplierId?.mobile || "",
                email: purchases[0]?.supplierId?.email || ""
            },
            totalBalance,
            count: purchases.length,
            data: purchases.map((purchase) => ({
                purchaseId: purchase._id,
                invoiceNo: purchase.invoiceNo,
                invoiceDate: purchase.invoiceDate,
                totalAmount: purchase.totalAmount,
                supplierBillAmount: purchase.supplierBillAmount,
                paidAmount: purchase.paidAmount,
                balanceAmount: purchase.balanceAmount,
                paymentStatus: purchase.paymentStatus
            }))
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getPurchases = async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("supplierId", "supplierName mobile email")
            .populate("items.productId", "name brand")
            .sort({ createdAt: -1 });

        const formatted = purchases.map((purchase) => {
            const totalGrossAmount = purchase.items.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0
            );

            const totalTaxAmount = purchase.items.reduce(
                (sum, item) => sum + Number(item.taxAmount || 0),
                0
            );

            return {
                _id: purchase._id,
                productName: purchase.items[0]?.productId?.name || "",

                supplier: {
                    id: purchase.supplierId?._id || "",
                    name: purchase.supplierId?.supplierName || purchase.supplierName || "",
                    mobile: purchase.supplierId?.mobile || "",
                    email: purchase.supplierId?.email || purchase.supplierEmail || ""
                },

                invoiceNo: purchase.invoiceNo,
                invoiceDate: purchase.invoiceDate,

                totalAmount: purchase.totalAmount || 0,
                totalGrossAmount: Math.round((totalGrossAmount + Number.EPSILON) * 100) / 100,
                totalTaxAmount: Math.round((totalTaxAmount + Number.EPSILON) * 100) / 100,

                supplierBillAmount: purchase.supplierBillAmount || 0,
                paidAmount: purchase.paidAmount || 0,
                balanceAmount: purchase.balanceAmount || 0,
                paymentHistory: purchase.paymentHistory || [],

                items: purchase.items.map((item) => ({
                    _id: item._id,

                    productId: item.productId?._id || item.productId || "",
                    productName: item.productId?.name || item.productName || "",

                    hsnCode: item.hsnCode || "",
                    taxPercentage: item.taxPercentage || 0,
                    categoryName: item.categoryName || "",

                    qty: item.qty || 0,
                    freeQty: item.freeQty || 0,
                    totalStockQty: item.totalStockQty || 0,

                    netcost: item.netcost || 0,
                    netAmount: item.netAmount || 0,
                    Rate: item.Rate || 0,

                    amount: item.amount || 0,
                    taxAmount: item.taxAmount || 0,
                    totalCostWithGST: item.totalCostWithGST || 0,

                    discountPercent: item.discountPercent || 0,
                    discountAmount: item.discountAmount || 0,

                    profitAmount: item.profitAmount || 0,
                    profitPercent: item.profitPercent || 0,
                    roiPercent: item.roiPercent || 0,

                    mrp: item.mrp || 0,
                    sellingPrice: item.sellingPrice || 0,

                    barcode: item.barcode || "",
                    receivedQty: item.receivedQty || 0,
                    pendingQty: item.pendingQty || 0
                })),

                superAdminId: purchase.superAdminId || null,
                adminId: purchase.adminId || null,
                createdBy: purchase.createdBy || null,
                createdAt: purchase.createdAt,
                updatedAt: purchase.updatedAt
            };
        });

        return res.status(200).json({
            success: true,
            count: formatted.length,
            data: formatted
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};



exports.getPurchaseById = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchase id"
            });
        }

        const purchase = await Purchase.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("supplierId", "supplierName mobile email")
            .populate("items.productId", "name brand description");

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        const totalGrossAmount = purchase.items.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
        );

        const totalTaxAmount = purchase.items.reduce(
            (sum, item) => sum + Number(item.taxAmount || 0),
            0
        );

        return res.status(200).json({
            success: true,
            message: "Purchase fetched successfully",
            data: {
                _id: purchase._id,

                supplier: {
                    id: purchase.supplierId?._id || "",
                    name: purchase.supplierId?.supplierName || "",
                    mobile: purchase.supplierId?.mobile || "",
                    email: purchase.supplierId?.email || ""
                },

                invoiceNo: purchase.invoiceNo,
                invoiceDate: purchase.invoiceDate
                    ? new Date(purchase.invoiceDate).toLocaleDateString("en-CA")
                    : "",

                totalAmount: purchase.totalAmount || 0,
                totalAmount: round2(purchase.totalAmount || 0),
                totalGrossAmount: round2(totalGrossAmount),
                totalTaxAmount: round2(totalTaxAmount),
                supplierBillAmount: purchase.supplierBillAmount || 0,
                paidAmount: purchase.paidAmount || 0,
                balanceAmount: purchase.balanceAmount || 0,
                paymentStatus: purchase.paymentStatus || "",
                paymentHistory: purchase.paymentHistory || [],

                superAdminId: purchase.superAdminId || null,
                adminId: purchase.adminId || null,
                createdBy: purchase.createdBy || null,
                createdAt: purchase.createdAt,
                updatedAt: purchase.updatedAt,

                items: purchase.items.map((item) => ({
                    _id: item._id,

                    productId: item.productId?._id || item.productId,

                    productName:
                        item.productName ||
                        item.productId?.name ||
                        "",

                    description:
                        item.description ||
                        item.productId?.description ||
                        "",

                    hsnCode: item.hsnCode || "",
                    taxPercentage: item.taxPercentage || 0,
                    categoryName: item.categoryName || "",

                    qty: item.qty || 0,
                    freeQty: item.freeQty || 0,
                    totalStockQty: item.totalStockQty || 0,

                    netcost: round2(item.netcost || 0),
                    netAmount: round2(item.netAmount || 0),
                    Rate: round2(item.Rate || 0),

                    amount: round2(item.amount || 0),
                    taxAmount: round2(item.taxAmount || 0),
                    totalCostWithGST: round2(item.totalCostWithGST || 0),
                    isGstIncluded: item.isGstIncluded,

                    discountPercent: item.discountPercent || 0,
                    discountAmount: round2(item.discountAmount || 0),

                    profitAmount: round2(item.profitAmount || 0),
                    profitPercent: round2(item.profitPercent || 0),
                    roiPercent: round2(item.roiPercent || 0),

                    mrp: item.mrp || 0,
                    sellingPrice: item.sellingPrice || 0,

                    barcode: item.barcode || "",
                    receivedQty: item.receivedQty || 0,
                    pendingQty: item.pendingQty || 0
                }))
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.updateSupplierBill = async (req, res) => {
    try {
        const { purchaseId } = req.params;
        const { amount, note } = req.body;

        const payAmount = Number(amount);

        if (isNaN(payAmount) || payAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid payment amount is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const purchase = await Purchase.findOne({
            _id: purchaseId,
            superAdminId: hierarchy.superAdminId
        });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase bill not found"
            });
        }

        if (payAmount > purchase.balanceAmount) {
            return res.status(400).json({
                success: false,
                message: "Payment amount cannot be greater than balance amount"
            });
        }

        purchase.paidAmount += payAmount;
        purchase.balanceAmount -= payAmount;

        purchase.paymentHistory.push({
            amount: payAmount,
            note: note || "Supplier payment",
            paidDate: new Date()
        });

        await purchase.save();

        return res.status(200).json({
            success: true,
            message: "Supplier payment updated successfully",
            data: {
                purchaseId: purchase._id,
                supplierBillAmount: purchase.supplierBillAmount,
                paidAmount: purchase.paidAmount,
                balanceAmount: purchase.balanceAmount,
                paymentHistory: purchase.paymentHistory
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
}

exports.updatePurchase = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { id } = req.params;

        const {
            supplierId,
            invoiceNo,
            invoiceDate,
            items
        } = req.body;

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchase id"
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Items are required"
            });
        }

        const purchase = await Purchase.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        for (const oldItem of purchase.items) {
            await Product.updateOne(
                {
                    _id: oldItem.productId,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: -Number(oldItem.totalStockQty || oldItem.qty || 0)
                    }
                }
            );
        }

        let processedItems = [];
        let totalAmount = 0;
        let totalGrossAmount = 0;
        let totalTaxAmount = 0;

        for (const item of items) {
            const product = await Product.findOne({
                _id: item.productId,
                superAdminId: hierarchy.superAdminId
            }).populate("categoryId", "name");

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const purchaseUnit = item.unit
                ? String(item.unit).trim().toLowerCase()
                : product.unit || "pcs";

            const purchaseUnitValue = item.unitValue
                ? Number(item.unitValue)
                : Number(product.unitValue || 1);

            if (!["pcs", "kg"].includes(purchaseUnit)) {
                return res.status(400).json({
                    success: false,
                    message: "Unit must be pcs or kg"
                });
            }

            if (isNaN(purchaseUnitValue) || purchaseUnitValue <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid unitValue is required"
                });
            }

            const qty = Number(item.qty);
            const freeQty = Number(item.freeQty || 0);
            const totalStockQty = qty + freeQty;

            const netcost = Number(item.netcost || item.netCost);
            const netAmount = round2(netcost * qty);

            const mrp = Number(item.mrp);
            const sellingPrice = Number(item.sellingPrice || mrp);

            const taxPercentage = Number(product.gstRate || 0);

            const discountPercent = Number(
                item.discountPercent || item.disPercent || 0
            );

            const manualDiscountAmount = Number(
                item.discountAmount || item.disAmount || 0
            );

            const isGstIncluded = item.isGstIncluded !== false;

            const grossAmount = round2(qty * netcost);

            const percentDiscountAmount = round2(
                grossAmount * discountPercent / 100
            );

            const discountAmount = round2(
                percentDiscountAmount + manualDiscountAmount
            );

            const amountAfterDiscount = round2(grossAmount - discountAmount);

            let amount = 0;
            let taxAmount = 0;
            let totalCostWithGST = 0;

            if (isGstIncluded) {
                totalCostWithGST = amountAfterDiscount;

                taxAmount = round2(
                    amountAfterDiscount * taxPercentage / 100
                );

                amount = round2(
                    amountAfterDiscount - taxAmount
                );
            } else {
                amount = amountAfterDiscount;

                taxAmount = round2(
                    amount * taxPercentage / 100
                );

                totalCostWithGST = round2(
                    amount + taxAmount
                );
            }

            totalGrossAmount = round2(totalGrossAmount + amount);
            totalTaxAmount = round2(totalTaxAmount + taxAmount);
            totalAmount = round2(totalAmount + totalCostWithGST);

            const Rate = totalStockQty > 0
                ? round2(amount / totalStockQty)
                : 0;

            const profitAmount = round2(sellingPrice - netcost);

            const profitPercent = sellingPrice > 0
                ? round2((profitAmount / sellingPrice) * 100)
                : 0;

            const roiPercent = netcost > 0
                ? round2((profitAmount / netcost) * 100)
                : 0;

            await Product.updateOne(
                {
                    _id: product._id,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: totalStockQty
                    }
                }
            );

            processedItems.push({
                productId: product._id,
                productName: product.name || "",

                description: item.description
                    ? String(item.description).trim()
                    : product.description || "",

                hsnId: product.hsnId || null,
                hsnCode: product.hsnCode || "",

                categoryId: product.categoryId?._id,
                categoryName: product.categoryId?.name || "",

                taxPercentage,
                taxAmount,

                discountPercent,
                discountAmount,
                amount,
                totalCostWithGST,
                isGstIncluded,

                freeQty,
                totalStockQty,

                qty,
                netcost,
                netAmount,
                Rate,
                mrp,
                sellingPrice,

                priceLevel: item.priceLevel || null,
                barcode,

                profitAmount,
                profitPercent,
                roiPercent,

                receivedQty: totalStockQty,
                pendingQty: 0
            });
        }

        let supplierData = {};

        if (supplierId) {
            const supplier = await Supplier.findOne({
                _id: supplierId,
                superAdminId: hierarchy.superAdminId
            });

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            supplierData = {
                supplierId: supplier._id,
                supplierName: supplier.supplierName || "",
                supplierEmail: supplier.email || ""
            };
        }

        purchase.invoiceNo = invoiceNo || purchase.invoiceNo;
        purchase.invoiceDate = invoiceDate || purchase.invoiceDate;
        purchase.items = processedItems;
        purchase.totalAmount = totalAmount;

        Object.assign(purchase, supplierData);

        await purchase.save();

        return res.status(200).json({
            success: true,
            message: "Purchase updated successfully",
            data: {
                _id: purchase._id,
                invoiceNo: purchase.invoiceNo,
                invoiceDate: purchase.invoiceDate,

                totalAmount: round2(totalAmount),
                totalGrossAmount: round2(totalGrossAmount),
                totalTaxAmount: round2(totalTaxAmount),

                items: processedItems
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.deleteAllPurchases = async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);

        const result = await Purchase.deleteMany({
            superAdminId: hierarchy.superAdminId
        });

        res.json({
            success: true,
            message: "All purchases deleted successfully",
            deletedCount: result.deletedCount
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.deletePurchase = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchase id"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const purchase = await Purchase.findOneAndDelete({
            _id: id,
            superAdminId: hierarchy.superAdminId
        });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        res.json({
            success: true,
            message: "Purchase deleted successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};
