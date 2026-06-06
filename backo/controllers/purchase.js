const mongoose = require("mongoose");

const Purchase = require("../models/purchase");
const Product = require("../models/product");
const Supplier = require("../models/supplier");
const Barcode = require("../models/barcode");
const PriceLevel = require("../models/price_level");
const { attachHierarchy } = require("../utils/hierarchy");

exports.createPurchase = async (req, res) => {
    try {
        const { supplierId, items, invoiceNo, invoiceDate, supplierBillAmount, paidAmount } = req.body;

        if (!supplierId || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Supplier and items are required"
            });
        }

        if (!invoiceNo) {
            return res.status(400).json({
                success: false,
                message: "Invoice number is required"
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

        let totalAmount = 0;

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        const processedItems = [];

        for (const item of items) {
            const productId = item.productId;

            const flavor = item.flavor ? String(item.flavor).trim() : "";
            const litters = item.litters ? String(item.litters).trim() : "";
            const mrp = Number(item.mrp);
            const qty = Number(item.qty);
            const costPrice = Number(item.costPrice);
            const sellingPrice = Number(item.sellingPrice || mrp);
            const priceLevel = item.priceLevel || null;

            const barcode = String(item.barcode || item.code || "").trim();

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

            if (isNaN(costPrice) || costPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid cost price"
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

            const gstpercentage = Number(product.gstRate || 0);
            const gst = round2((qty * costPrice * gstpercentage) / 100);


            const productMrps = Array.isArray(product.mrps) ? product.mrps : [];
            const productFlavors = Array.isArray(product.flavor) ? product.flavor : [];
            const productLitters = Array.isArray(product.litters) ? product.litters : [];

            if (!productMrps.includes(mrp)) {
                return res.status(400).json({
                    success: false,
                    message: "Selected MRP not found in product"
                });
            }

            if (flavor && !productFlavors.includes(flavor)) {
                return res.status(400).json({
                    success: false,
                    message: "Selected flavor not found in product"
                });
            }

            if (litters && !productLitters.includes(litters)) {
                return res.status(400).json({
                    success: false,
                    message: "Selected litters not found in product"
                });
            }

            if (barcode) {
                await Barcode.findOneAndUpdate(
                    {
                        code: barcode,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $set: {
                            productId: product._id,
                            code: barcode,

                            mrp,
                            sellingPrice,
                            costPrice,
                            gstRate: gstpercentage,

                            flavor,
                            litters,

                            isSold: false,

                            ...hierarchy,
                            createdBy: req.user.userId
                        },
                        $inc: {
                            qty: qty,
                            availableQty: qty
                        }
                    },
                    {
                        upsert: true,
                        returnDocument: "after"
                    }
                );
            }

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
                            baseOn: "costPrice",
                            profitPercent: 0
                        },

                        slabs: priceLevel.slabs || [],

                        ...hierarchy,
                        createdBy: req.user.userId,
                        isActive: true
                    },
                    {
                        upsert: true,
                        returnDocument: "after",
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
                        stock: qty
                    }
                }
            );


            totalAmount = round2(totalAmount + (qty * costPrice) + gst);

            processedItems.push({
                productId: product._id,
                productName: product.name || "",

                hsnId: product.hsnId || null,
                hsnCode: product.hsnCode || "",
                gstpercentage,
                gst,

                categoryId: product.categoryId?._id,
                categoryName: product.categoryId?.name || "",
                brand: product.brand || "",

                flavor,
                litters,
                qty,
                costPrice,
                mrp,
                sellingPrice,
                priceLevel,
                barcode,

                receivedQty: 0,
                pendingQty: qty
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

                invoiceDate: responsePurchase.invoiceDate,

                totalAmount: round2(responsePurchase.totalAmount),

                supplierBillAmount: round2(responsePurchase.supplierBillAmount),
                paidAmount: round2(responsePurchase.paidAmount),
                balanceAmount: round2(responsePurchase.balanceAmount),
                paymentStatus: responsePurchase.paymentStatus,

                items: responsePurchase.items.map((item) => ({
                    _id: item._id,

                    productId: item.productId?._id,

                    productName: item.productId?.name || "",

                    brand:
                        item.productId?.brand ||
                        item.brand ||
                        "",

                    hsnCode:
                        item.hsnCode || "",

                    categoryName:
                        item.categoryName || "",

                    gstpercentage:
                        item.gstpercentage || 0,

                    categoryName:
                        item.categoryName || "",

                    flavor:
                        item.flavor || "",

                    litters:
                        item.litters || "",

                    qty:
                        item.qty || 0,

                    costPrice:
                        item.costPrice || 0,

                    mrp:
                        item.mrp || 0,

                    sellingPrice:
                        item.sellingPrice || 0,

                    gst: round2(item.gst || 0),

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

        const formatted = purchases.map((purchase) => ({
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

            supplierBillAmount: purchase.supplierBillAmount || 0,
            paidAmount: purchase.paidAmount || 0,
            balanceAmount: purchase.balanceAmount || 0,
            paymentHistory: purchase.paymentHistory || [],

            items: purchase.items.map((item) => ({
                _id: item._id,

                productId: item.productId?._id || item.productId || "",
                productName: item.productId?.name || item.productName || "",

                brand: item.productId?.brand || item.brand || "",
                hsnCode: item.hsnCode || "",
                gstpercentage: item.gstpercentage || 0,
                categoryName: item.categoryName || "",

                flavor: item.flavor || "",
                litters: item.litters || "",

                qty: item.qty || 0,
                costPrice: item.costPrice || 0,
                mrp: item.mrp || 0,
                sellingPrice: item.sellingPrice || 0,
                gst: item.gst || 0,

                barcode: item.barcode || "",
                receivedQty: item.receivedQty || 0,
                pendingQty: item.pendingQty || 0
            })),

            superAdminId: purchase.superAdminId || null,
            adminId: purchase.adminId || null,
            createdBy: purchase.createdBy || null,
            createdAt: purchase.createdAt,
            updatedAt: purchase.updatedAt
        }));

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
            .populate("items.productId", "name brand");

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                _id: purchase._id,
                productName: purchase.items[0]?.productId?.name || "",

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
                totalAmount: purchase.totalAmount,

                supplierBillAmount: purchase.supplierBillAmount || 0,
                paidAmount: purchase.paidAmount || 0,
                balanceAmount: purchase.balanceAmount || 0,
                paymentHistory: purchase.paymentHistory || [],

                items: purchase.items.map((item) => ({
                    _id: item._id,

                    productId: item.productId,
                    productName: item.productName,

                    brand:
                        item.productId?.brand ||
                        item.brand ||
                        "",

                    hsnCode: item.hsnCode || "",

                    gstpercentage:
                        item.gstpercentage || 0,

                    categoryName:
                        item.categoryName || "",

                    flavor: item.flavor || "",
                    litters: item.litters || "",

                    qty: item.qty || 0,

                    costPrice:
                        item.costPrice || 0,

                    mrp: item.mrp || 0,

                    sellingPrice:
                        item.sellingPrice || 0,

                    gst: item.gst || 0,

                    barcode:
                        item.barcode || "",

                    receivedQty:
                        item.receivedQty || 0,

                    pendingQty:
                        item.pendingQty || 0,
                    superAdminId: purchase.superAdminId || null,
                    adminId: purchase.adminId || null,
                    createdBy: purchase.createdBy || null,
                    createdAt: purchase.createdAt,
                    updatedAt: purchase.updatedAt
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
            note: note || "Supplier payment"
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchase id"
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
                        stock: -oldItem.qty
                    }
                }
            );
        }

        let processedItems = [];
        let totalAmount = 0;


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

            const qty = Number(item.qty);
            const costPrice = Number(item.costPrice);
            const mrp = Number(item.mrp);
            const sellingPrice =
                Number(item.sellingPrice || mrp);

            const gstpercentage =
                Number(product.gstRate || 0);

            const gst =
                (qty * costPrice * gstpercentage) / 100;


            await Product.updateOne(
                {
                    _id: product._id,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: qty
                    }
                }
            );

            totalAmount +=
                (qty * costPrice) + gst;

            processedItems.push({

                productId: product._id,

                hsnId: product.hsnId || null,

                hsnCode:
                    product.hsnCode || "",

                gstpercentage,
                gst,

                categoryId:
                    product.categoryId?._id,

                categoryName:
                    product.categoryId?.name || "",

                brand:
                    product.brand || "",

                flavor:
                    item.flavor || "",

                litters:
                    item.litters || "",

                qty,
                costPrice,
                mrp,
                sellingPrice,

                barcode:
                    item.barcode || "",

                receivedQty:
                    item.receivedQty || 0,

                pendingQty:
                    item.pendingQty || qty,

                superAdminId: purchase.superAdminId || null,
                adminId: purchase.adminId || null,
                createdBy: purchase.createdBy || null,
                createdAt: purchase.createdAt,
                updatedAt: purchase.updatedAt
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
                supplierName:
                    supplier.supplierName || "",

                supplierEmail:
                    supplier.email || ""
            };
        }


        purchase.invoiceNo =
            invoiceNo || purchase.invoiceNo;

        purchase.invoiceDate =
            invoiceDate || purchase.invoiceDate;

        purchase.items = processedItems;

        purchase.totalAmount = totalAmount;

        Object.assign(purchase, supplierData);

        await purchase.save();

        const updatedPurchase =
            await Purchase.findById(purchase._id)
                .populate(
                    "items.productId",
                    "name brand"
                );

        return res.status(200).json({
            success: true,
            message: "Purchase updated successfully",
            data: updatedPurchase
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
