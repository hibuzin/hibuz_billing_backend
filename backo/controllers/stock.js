const Product = require("../models/product");
const Purchase = require("../models/purchase");
const Barcode = require("../models/barcode");
const Bill = require("../models/bill");
const { attachHierarchy } = require("../utils/hierarchy");


exports.allstockcheck = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("items.productId", "name brand stock")
            .sort({ createdAt: -1 });

        let data = [];

        for (const purchase of purchases) {
            for (const item of purchase.items) {

                const barcode = await Barcode.findOne({
                    productId: item.productId?._id,
                    code: item.barcode,
                    superAdminId: hierarchy.superAdminId
                }).select("code qty availableQty unit unitValue");

                const productStock = Number(
                    Number(item.productId?.stock || 0).toFixed(2)
                );

                const barcodeStock = Number(
                    Number(barcode?.availableQty || 0).toFixed(2)
                );

                const currentStock = productStock;

                const purchasedQty = Number(item.qty || 0);
                const receivedQty = Number(item.receivedQty || item.qty || 0);
                const pendingQty = Number(item.pendingQty || 0);

                const soldQty = Math.max(
                    Number((purchasedQty - currentStock).toFixed(2)),
                    0
                );

                const formatStockQty = (value) => {
                    const num = Number(value || 0);
                    return Number.isInteger(num)
                        ? String(num)
                        : String(Number(num.toFixed(2)));
                };

                const stockUnit = item.unit || barcode?.unit || "pcs";
                const stockUnitValue = Number(item.unitValue || barcode?.unitValue || 0);

                let totalStockText = "";

                if (stockUnit === "kg") {
                    totalStockText = `${formatStockQty(
                        currentStock * stockUnitValue
                    )} kg`;
                }

                else if (stockUnit === "g") {

                    const totalKg =
                        (currentStock * stockUnitValue) / 1000;

                    totalStockText = `${formatStockQty(totalKg)} kg`;
                }

                else {
                    totalStockText = `${formatStockQty(currentStock)} pcs`;
                }

                data.push({
                    purchaseId: purchase._id,
                    invoiceNo: purchase.invoiceNo,
                    invoiceDate: purchase.invoiceDate,

                    productId: item.productId?._id || "",
                    productName: item.productId?.name || "",
                    brand: item.productId?.brand || item.brand || "",

                    barcode: item.barcode || barcode?.code || "",

                    currentStock,



                    mrp: item.mrp || 0,
                    costPrice: item.costPrice || 0,
                    sellingPrice: item.sellingPrice || 0,


                    unit: item.unit || "pcs",

                    unitValue: item.unitValue || "",



                    unitText: item.unitValue
                        ? `${item.unitValue} ${item.unit || "pcs"}`
                        : `${item.unit || "pcs"}`,



                    kg: item.kg || "",

                    purchasedQty,
                    receivedQty,
                    pendingQty,
                    soldQty,

                    status:
                        currentStock <= 0
                            ? "Out Of Stock"
                            : currentStock <= 10
                                ? "Low Stock"
                                : "Available"
                });
            }
        }

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getStockValue = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("items.productId", "name brand stock")
            .sort({ createdAt: -1 });

        const stockMap = {};
        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        for (const purchase of purchases) {
            for (const item of purchase.items) {
                const product = item.productId;
                if (!product) continue;

                const barcode = await Barcode.findOne({
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId
                }).select("code availableQty");

                const key = `${product._id}_${barcode?.code || ""}_${item.mrp}_${item.costPrice}_${item.sellingPrice}_${item.flavor}_${item.litters}`;

                if (!stockMap[key]) {
                    const currentStock = Number(
                        barcode?.availableQty ?? product.stock ?? 0
                    );

                    stockMap[key] = {
                        productId: product._id,
                        productName: product.name || "",
                        brand: product.brand || item.brand || "",

                        barcode: barcode?.code || "",

                        currentStock,
                        productStock: Number(product.stock || 0),
                        barcodeStock: Number(barcode?.availableQty || 0),

                        mrp: Number(item.mrp || 0),
                        costPrice: Number(item.costPrice || 0),
                        sellingPrice: Number(item.sellingPrice || 0),


                        kg: item.kg || "",

                        costValue: 0,
                        sellingValue: 0,
                        mrpValue: 0
                    };
                }
            }
        }

        let totalCostValue = 0;
        let totalSellingValue = 0;
        let totalMrpValue = 0;

        const data = Object.values(stockMap).map((item) => {
            item.costValue = round2(item.currentStock * item.costPrice);
            item.sellingValue = round2(item.currentStock * item.sellingPrice);
            item.mrpValue = round2(item.currentStock * item.mrp);

            totalCostValue += item.costValue;
            totalSellingValue += item.sellingValue;
            totalMrpValue += item.mrpValue;

            return item;
        });

        return res.status(200).json({
            success: true,
            count: data.length,
            summary: {
                totalCostValue: round2(totalCostValue),
                totalSellingValue: round2(totalSellingValue),
                totalMrpValue: round2(totalMrpValue),
                expectedProfit: round2(totalSellingValue - totalCostValue)
            },
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getproductsearchstock = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { search } = req.query;

        if (!search || search.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Search is required"
            });
        }

        const searchText = search.trim().toLowerCase();

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("items.productId", "name brand stock unit unitValue")
            .sort({ createdAt: -1 });

        const data = [];

        for (const purchase of purchases) {
            for (const item of purchase.items) {
                const productName = item.productId?.name || "";
                const brand = item.productId?.brand || item.brand || "";
                const barcodeCode = item.barcode || "";

                const matched =
                    productName.toLowerCase().includes(searchText) ||
                    brand.toLowerCase().includes(searchText) ||
                    barcodeCode.toLowerCase().includes(searchText);

                if (matched) {
                    const barcode = await Barcode.findOne({
                        productId: item.productId?._id,
                        code: item.barcode,
                        superAdminId: hierarchy.superAdminId
                    }).select("code qty availableQty unit unitValue");

                    const currentStock = Number(
                        barcode?.availableQty ?? item.productId?.stock ?? 0
                    );

                    data.push({
                        productId: item.productId?._id || item.productId,
                        productName,
                        brand,

                        barcode: barcode?.code || item.barcode || "",

                        mrp: item.mrp || 0,
                        costPrice: item.costPrice || 0,
                        sellingPrice: item.sellingPrice || 0,

                        currentStock,
                        productStock: Number(item.productId?.stock || 0),
                        barcodeStock: Number(barcode?.availableQty || 0),
                        barcodeQty: Number(barcode?.qty || 0),

                        unit: item.unit || item.productId?.unit || "pcs",
                        unitValue: item.unitValue || item.productId?.unitValue || 1,

                        kg: item.kg || "",

                        displayName: item.unitValue
                            ? `${item.unitValue} ${item.unit || "pcs"} ${productName}`
                            : `${item.unit || "pcs"} ${productName}`,

                        totalUnitText: item.unitValue
                            ? `${currentStock * Number(item.unitValue || 0)} ${item.unit || "pcs"}`
                            : `${currentStock} ${item.unit || "pcs"}`
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.productStockById = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product id is required"
            });
        }

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

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId,
            "items.productId": productId
        })
            .populate("items.productId", "name brand stock")
            .sort({ createdAt: -1 });

        let totalPurchasedQty = 0;
        let totalReceivedQty = 0;
        let totalPendingQty = 0;
        let totalCostValue = 0;
        let totalSellingValue = 0;

        const data = [];

        for (const purchase of purchases) {
            for (const item of purchase.items) {
                if (String(item.productId?._id) !== String(productId)) continue;

                const barcode = await Barcode.findOne({
                    productId: productId,
                    code: item.barcode,
                    superAdminId: hierarchy.superAdminId
                }).select("code qty availableQty");

                const currentStock = Number(product.stock || 0);

                const qty = Number(item.qty || 0);
                const receivedQty = Number(item.receivedQty || item.qty || 0);
                const pendingQty = Number(item.pendingQty || 0);
                const costPrice = Number(item.costPrice || 0);
                const sellingPrice = Number(item.sellingPrice || 0);

                totalPurchasedQty += qty;
                totalReceivedQty += receivedQty;
                totalPendingQty += pendingQty;
                totalCostValue += qty * costPrice;
                totalSellingValue += qty * sellingPrice;

                data.push({
                    purchaseId: purchase._id,
                    invoiceNo: purchase.invoiceNo,
                    invoiceDate: purchase.invoiceDate,

                    productId: item.productId?._id || "",
                    productName: item.productId?.name || product.name || "",
                    brand: item.productId?.brand || item.brand || product.brand || "",

                    barcode: barcode?.code || item.barcode || "",

                    currentStock,


                    mrp: item.mrp || 0,
                    costPrice,
                    sellingPrice,

                    unit: item.unit || product.unit || "pcs",
                    unitValue: item.unitValue || "",

                    unitText: item.unitValue
                        ? `${item.unitValue} ${item.unit || product.unit || "pcs"}`
                        : `${item.unit || product.unit || "pcs"}`,



                    kg: item.kg || "",

                    purchasedQty: qty,
                    receivedQty,
                    pendingQty,

                    status:
                        currentStock <= 0
                            ? "Out Of Stock"
                            : currentStock <= 10
                                ? "Low Stock"
                                : "Available"
                });
            }
        }

        const latestItem = data[0] || null;

        return res.status(200).json({
            success: true,
            product: {
                productId: product._id,
                productName: product.name,
                brand: product.brand || "",

                unit: product.unit || "pcs",
                unitValue: latestItem?.unitValue || product.unitValue || "",

                currentStock: Number(product.stock || 0),

                totalkg: latestItem?.unitValue
                    ? `${Number(product.stock || 0) * Number(latestItem.unitValue || 0)} ${latestItem.unit || product.unit || "pcs"}`
                    : "",

                status:
                    Number(product.stock || 0) <= 0
                        ? "Out Of Stock"
                        : Number(product.stock || 0) <= 10
                            ? "Low Stock"
                            : "Available"
            },
            summary: {
                totalPurchasedQty,
                totalReceivedQty,
                totalPendingQty,
                totalCostValue: Number(totalCostValue.toFixed(2)),
                totalSellingValue: Number(totalSellingValue.toFixed(2)),
                expectedProfit: Number((totalSellingValue - totalCostValue).toFixed(2))
            },
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.getTopSellingProducts = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const limit = Math.max(1, Number(req.query.limit || 10));

        const result = await Bill.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId
                }
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.productId",
                    productNameFromBill: { $first: "$items.productName" },
                    nameFromBill: { $first: "$items.name" },
                    brand: { $first: "$items.brand" },
                    barcode: { $first: "$items.barcode" },
                    totalQtySold: { $sum: "$items.qty" },
                    totalSalesAmount: { $sum: "$items.finalPrice" },
                    totalGST: { $sum: "$items.gstAmount" }
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            },
            {
                $unwind: {
                    path: "$product",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $sort: {
                    totalQtySold: -1
                }
            },
            {
                $limit: limit
            },
            {
                $project: {
                    _id: 0,
                    productId: "$_id",
                    productName: {
                        $ifNull: [
                            "$productNameFromBill",
                            {
                                $ifNull: [
                                    "$nameFromBill",
                                    "$product.name"
                                ]
                            }
                        ]
                    },
                    brand: {
                        $ifNull: ["$brand", "$product.brand"]
                    },
                    barcode: 1,

                    currentStock: { $ifNull: ["$product.stock", 0] },
                    unit: { $ifNull: ["$product.unit", "pcs"] },
                    unitValue: { $ifNull: ["$product.unitValue", 1] },

                    totalQtySold: 1,
                    totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
                    totalGST: { $round: ["$totalGST", 2] }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Top selling products fetched successfully",
            data: result
        });

    } catch (error) {
        console.error("TOP SELLING ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.lowstockcheck = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            availableQty: { $gt: 0 }
        })
            .populate(
                "productId",
                "name  stock categoryId gstRate lowStockQty unit unitValue"
            )
            .sort({ availableQty: 1 });

        let totalLowStockQty = 0;

        const filtered = barcodes.filter((barcode) => {
            const currentQty = Number(barcode.availableQty || 0);
            const lowStockQty = Number(barcode.productId?.lowStockQty || 10);

            return currentQty <= lowStockQty;
        });

        const data = filtered.map((barcode, index) => {
            const qty = Number(barcode.availableQty || 0);
            const lowStockQty = Number(barcode.productId?.lowStockQty || 10);

            totalLowStockQty += qty;

            return {
                sno: index + 1,
                productId: barcode.productId?._id || "",
                productName: barcode.productId?.name || "",
                brand: barcode.productId?.brand || "",

                barcode: barcode.code || "",
                currentStock: qty,
                lowStockQty,
                totalProductStock: Number(barcode.productId?.stock || 0),

                unit: barcode.unit || barcode.productId?.unit || "pcs",
                unitValue: barcode.unitValue || barcode.productId?.unitValue || 1,
                kg: barcode.kg || "",
                totalUnitText: `${qty * Number(barcode.unitValue || barcode.productId?.unitValue || 1)} ${barcode.unit || barcode.productId?.unit || "pcs"}`,

                mrp: barcode.mrp || 0,
                costPrice: barcode.costPrice || 0,
                sellingPrice: barcode.sellingPrice || 0,

                gstRate: Number(
                    barcode.gstRate ||
                    barcode.productId?.gstRate ||
                    0
                ),

                status: "Low Stock"
            };
        });

        return res.status(200).json({
            success: true,
            summary: {
                totalLowStockProducts: data.length,
                totalLowStockQty
            },
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.outofstockcheck = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            availableQty: { $lte: 0 }
        })
            .populate(
                "productId",
                "name brand stock categoryId gstRate mrp unit unitValue"
            )
            .sort({ updatedAt: -1 });

        const data = barcodes.map((barcode, index) => ({
            sno: index + 1,
            productId: barcode.productId?._id || "",
            productName: barcode.productId?.name || "",
            brand: barcode.productId?.brand || "",

            barcode: barcode.code || "",
            currentStock: Number(barcode.availableQty || 0),
            totalProductStock: Number(barcode.productId?.stock || 0),

            unit: barcode.unit || barcode.productId?.unit || "pcs",
            unitValue: barcode.unitValue || barcode.productId?.unitValue || 1,

            kg: barcode.kg || "",

            totalUnitText: `${Number(barcode.availableQty || 0) * Number(barcode.unitValue || barcode.productId?.unitValue || 1)} ${barcode.unit || barcode.productId?.unit || "pcs"}`,

            mrp: barcode.mrp || 0,
            costPrice: barcode.costPrice || 0,
            sellingPrice: barcode.sellingPrice || 0,



            gstRate: Number(
                barcode.gstRate ||
                barcode.productId?.gstRate ||
                0
            ),

            status: "Out Of Stock"
        }));

        return res.status(200).json({
            success: true,
            summary: {
                totalOutOfStockProducts: data.length
            },
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};