const Product = require("../models/product");
const mongoose = require("mongoose");
const Purchase = require("../models/purchase");
const Barcode = require("../models/barcode");
const Bill = require("../models/bill");
const { attachHierarchy } = require("../utils/hierarchy");


exports.allstockcheck = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("productId", "name brand itemCode stock unit unitValue mrp costPrice sellingPrice")
            .sort({ createdAt: -1 });

        const data = [];

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
        };

        for (const barcode of barcodes) {
            const product = barcode.productId;

            if (!product) continue;

            const currentStock = Number(Number(barcode.availableQty || 0).toFixed(2));
            const totalQty = Number(Number(barcode.qty || 0).toFixed(2));

            const unit = barcode.unit || product.unit || "pcs";
            const unitValue = Number(barcode.unitValue || product.unitValue || 1);

            let totalStockText = "";

            if (unit === "kg") {
                totalStockText = `${formatQty(currentStock * unitValue)} kg`;
            } else if (unit === "g") {
                totalStockText = `${formatQty((currentStock * unitValue) / 1000)} kg`;
            } else {
                totalStockText = `${formatQty(currentStock)} pcs`;
            }

            const soldQty = Math.max(
                Number((totalQty - currentStock).toFixed(2)),
                0
            );

            data.push({
                productId: product._id,
                productName: product.name || "",
                brand: product.brand || "",
                itemCode: product.itemCode || "",

                barcode: barcode.code,

                totalQty,
                currentStock,
                soldQty,

                totalStockText,

                mrp: barcode.mrp || product.mrp || 0,
                costPrice: barcode.costPrice || product.costPrice || 0,
                sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,

                unit,
                unitValue,
                unitText: `${unitValue} ${unit}`,

                status:
                    currentStock <= 0
                        ? "Out Of Stock"
                        : currentStock <= 10
                            ? "Low Stock"
                            : "Available"
            });
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


exports.getAllRepackStock = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate(
                "productId",
                "name brand itemCode stock unit unitValue mrp costPrice sellingPrice parentProductId productType"
            )
            .sort({ createdAt: -1 });

        const data = [];

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num)
                ? String(num)
                : String(Number(num.toFixed(2)));
        };

        for (const barcode of barcodes) {
            const product = barcode.productId;

            if (!product) continue;

            // Only repack products
            if (product.productType !== "repack") continue;

            const currentStock = Number(Number(barcode.availableQty || 0).toFixed(2));
            const totalQty = Number(Number(barcode.qty || 0).toFixed(2));
            const soldQty = Math.max(
                Number((totalQty - currentStock).toFixed(2)),
                0
            );

            data.push({
                productId: product._id,
                bulkProductId: product.parentProductId,

                productName: product.name,
                brand: product.brand || "",
                itemCode: product.itemCode || "",

                barcode: barcode.code,

                totalQty,
                currentStock,
                soldQty,

                mrp: barcode.mrp || product.mrp || 0,
                costPrice: barcode.costPrice || product.costPrice || 0,
                sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,

                unit: barcode.unit,
                unitValue: barcode.unitValue,
                unitText: `${barcode.unitValue} ${barcode.unit}`,

                status:
                    currentStock <= 0
                        ? "Out Of Stock"
                        : currentStock <= 10
                            ? "Low Stock"
                            : "Available"
            });
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


exports.getAllBulkProducts = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const bulkProducts = await Product.find({
            superAdminId: hierarchy.superAdminId,
            productType: "bulk"
        })
            .select(
                "name brand itemCode stock unit unitValue mrp costPrice sellingPrice"
            )
            .sort({ name: 1 });

        const data = bulkProducts.map((item) => ({
            bulkId: item._id,
            productName: item.name,
            brand: item.brand || "",
            itemCode: item.itemCode || "",
            stock: item.stock || 0,
            unit: item.unit,
            unitValue: item.unitValue,
            mrp: item.mrp || 0,
            costPrice: item.costPrice || 0,
            sellingPrice: item.sellingPrice || 0
        }));

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


exports.stockCheckByBulkId = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { bulkId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(bulkId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid bulk product id"
            });
        }

        const bulkProduct = await Product.findOne({
            _id: bulkId,
            superAdminId: hierarchy.superAdminId,
            productType: "bulk"
        });

        if (!bulkProduct) {
            return res.status(404).json({
                success: false,
                message: "Bulk product not found"
            });
        }

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId
        }).populate(
            "productId",
            "name brand itemCode stock unit unitValue mrp costPrice sellingPrice parentProductId productType"
        );

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num)
                ? String(num)
                : String(Number(num.toFixed(2)));
        };

        const data = [];

        for (const barcode of barcodes) {
            const product = barcode.productId;

            if (!product) continue;

            // Only repack products of this bulk product
            if (
                product.productType !== "repack" ||
                String(product.parentProductId) !== String(bulkId)
            ) {
                continue;
            }

            const currentStock = Number(barcode.availableQty || 0);
            const totalQty = Number(barcode.qty || 0);
            const soldQty = Math.max(totalQty - currentStock, 0);

            data.push({
                productId: product._id,
                productName: product.name,
                barcode: barcode.code,
                currentStock,
                soldQty,
                totalQty,
                unit: barcode.unit,
                unitValue: barcode.unitValue
            });
        }

        return res.status(200).json({
            success: true,
            bulkProduct: {
                _id: bulkProduct._id,
                name: bulkProduct.name,
                stock: bulkProduct.stock,
                unit: bulkProduct.unit,
                unitValue: bulkProduct.unitValue
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

exports.getStockValue = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const round2 = (num) =>
            Math.round((Number(num) + Number.EPSILON) * 100) / 100;

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("productId", "name brand itemCode stock mrp costPrice sellingPrice unit unitValue")
            .sort({ createdAt: -1 });

        let totalCostValue = 0;
        let totalSellingValue = 0;
        let totalMrpValue = 0;

        const data = [];

        for (const barcode of barcodes) {
            const product = barcode.productId;
            if (!product) continue;

            const currentStock = Number(barcode.availableQty || 0);

            const mrp = Number(barcode.mrp || product.mrp || 0);
            const costPrice = Number(barcode.costPrice || product.costPrice || 0);
            const sellingPrice = Number(barcode.sellingPrice || product.sellingPrice || 0);

            const costValue = round2(currentStock * costPrice);
            const sellingValue = round2(currentStock * sellingPrice);
            const mrpValue = round2(currentStock * mrp);

            totalCostValue += costValue;
            totalSellingValue += sellingValue;
            totalMrpValue += mrpValue;

            data.push({
                productId: product._id,
                productName: product.name || "",
                brand: product.brand || "",
                itemCode: product.itemCode || "",

                barcode: barcode.code || "",

                currentStock,
                productStock: Number(product.stock || 0),
                barcodeStock: currentStock,
                barcodeQty: Number(barcode.qty || 0),

                mrp,
                costPrice,
                sellingPrice,

                costValue,
                sellingValue,
                mrpValue,

                unit: barcode.unit || product.unit || "pcs",
                unitValue: barcode.unitValue || product.unitValue || 1,

                status:
                    currentStock <= 0
                        ? "Out Of Stock"
                        : currentStock <= 10
                            ? "Low Stock"
                            : "Available"
            });
        }

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

        const searchText = search.trim();

        const products = await Product.find({
            superAdminId: hierarchy.superAdminId,
            $or: [
                { name: { $regex: searchText, $options: "i" } },
                { itemCode: { $regex: searchText, $options: "i" } },
                { brand: { $regex: searchText, $options: "i" } }
            ]
        });

        const productIds = products.map(p => p._id);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            $or: [
                { productId: { $in: productIds } },
                { code: { $regex: searchText, $options: "i" } }
            ]
        })
            .populate(
                "productId",
                "name itemCode brand stock unit unitValue mrp costPrice sellingPrice"
            )

            .sort({ createdAt: -1 });

        const data = [];

        for (const barcode of barcodes) {
            const product = barcode.productId;
            if (!product) continue;

            const currentStock = Number(barcode.availableQty || 0);
            const barcodeQty = Number(barcode.qty || 0);

            data.push({
                productId: product._id,
                itemCode: product.itemCode || "",
                productName: product.name || "",
                brand: product.brand || "",

                barcode: barcode.code,

                currentStock,
                productStock: Number(product.stock || 0),
                barcodeStock: currentStock,
                barcodeQty,

                soldQty: Math.max(
                    Number((barcodeQty - currentStock).toFixed(2)),
                    0
                ),

                mrp: barcode.mrp || product.mrp || 0,
                costPrice: barcode.costPrice || product.costPrice || 0,
                sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,

                unit: barcode.unit || product.unit || "pcs",
                unitValue: barcode.unitValue || product.unitValue || 1,

                displayName: `${barcode.unitValue || product.unitValue || 1} ${barcode.unit || product.unit || "pcs"} ${product.name}`,

                status:
                    currentStock <= 0
                        ? "Out Of Stock"
                        : currentStock <= 10
                            ? "Low Stock"
                            : "Available"
            });
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

        const barcodes = await Barcode.find({
            productId,
            superAdminId: hierarchy.superAdminId
        }).sort({ createdAt: -1 });

        let totalQty = 0;
        let currentStock = 0;
        let totalCostValue = 0;
        let totalSellingValue = 0;

        const data = [];

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num)
                ? String(num)
                : String(Number(num.toFixed(2)));
        };

        for (const barcode of barcodes) {
            const barcodeQty = Number(barcode.qty || 0);
            const availableQty = Number(barcode.availableQty || 0);

            const unit = barcode.unit || product.unit || "pcs";
            const unitValue = Number(barcode.unitValue || product.unitValue || 1);

            totalQty += barcodeQty;
            currentStock += availableQty;

            totalCostValue += availableQty * Number(barcode.costPrice || product.costPrice || 0);
            totalSellingValue += availableQty * Number(barcode.sellingPrice || product.sellingPrice || 0);

            let totalStockText = "";

            if (unit === "kg") {
                totalStockText = `${formatQty(availableQty * unitValue)} kg`;
            } else if (unit === "g") {
                totalStockText = `${formatQty((availableQty * unitValue) / 1000)} kg`;
            } else {
                totalStockText = `${formatQty(availableQty)} pcs`;
            }

            data.push({
                productId: product._id,
                productName: product.name,
                brand: product.brand || "",
                itemCode: product.itemCode || "",

                barcode: barcode.code,

                totalQty: barcodeQty,
                currentStock: availableQty,
                soldQty: Math.max(Number((barcodeQty - availableQty).toFixed(2)), 0),

                totalStockText,

                mrp: barcode.mrp || product.mrp || 0,
                costPrice: barcode.costPrice || product.costPrice || 0,
                sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,

                unit,
                unitValue,
                unitText: `${unitValue} ${unit}`,

                status:
                    availableQty <= 0
                        ? "Out Of Stock"
                        : availableQty <= 10
                            ? "Low Stock"
                            : "Available"
            });
        }

        let productTotalStockText = "";

        if (product.unit === "kg") {
            productTotalStockText = `${formatQty(currentStock * Number(product.unitValue || 1))} kg`;
        } else if (product.unit === "g") {
            productTotalStockText = `${formatQty((currentStock * Number(product.unitValue || 1)) / 1000)} kg`;
        } else {
            productTotalStockText = `${formatQty(currentStock)} pcs`;
        }

        return res.status(200).json({
            success: true,
            product: {
                productId: product._id,
                productName: product.name,
                brand: product.brand || "",
                itemCode: product.itemCode || "",

                unit: product.unit || "pcs",
                unitValue: product.unitValue || 1,

                currentStock: Number(currentStock.toFixed(2)),
                totalStock: productTotalStockText,

                status:
                    currentStock <= 0
                        ? "Out Of Stock"
                        : currentStock <= 10
                            ? "Low Stock"
                            : "Available"
            },
            summary: {
                totalQty: Number(totalQty.toFixed(2)),
                currentStock: Number(currentStock.toFixed(2)),
                soldQty: Math.max(Number((totalQty - currentStock).toFixed(2)), 0),
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
                    _id: {
                        productId: "$items.productId",
                        barcode: "$items.barcode"
                    },
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
                    localField: "_id.productId",
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
                $lookup: {
                    from: "barcodes",
                    let: {
                        productId: "$_id.productId",
                        barcodeCode: "$_id.barcode",
                        superAdminId: hierarchy.superAdminId
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$productId", "$$productId"] },
                                        { $eq: ["$code", "$$barcodeCode"] },
                                        { $eq: ["$superAdminId", "$$superAdminId"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "barcodeData"
                }
            },
            {
                $unwind: {
                    path: "$barcodeData",
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
                    productId: "$_id.productId",

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

                    barcode: "$_id.barcode",

                    currentStock: {
                        $ifNull: ["$barcodeData.availableQty", "$product.stock"]
                    },

                    barcodeStock: {
                        $ifNull: ["$barcodeData.availableQty", 0]
                    },

                    productStock: {
                        $ifNull: ["$product.stock", 0]
                    },

                    unit: {
                        $ifNull: ["$barcodeData.unit", "$product.unit"]
                    },

                    unitValue: {
                        $ifNull: ["$barcodeData.unitValue", "$product.unitValue"]
                    },

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
                "name brand stock categoryId gstRate lowStockQty unit unitValue"
            )
            .sort({ availableQty: 1 });

        let totalLowStockQty = 0;

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num)
                ? String(num)
                : String(Number(num.toFixed(2)));
        };

        const filtered = barcodes.filter((barcode) => {
            const currentQty = Number(barcode.availableQty || 0);
            const lowStockQty = Number(barcode.productId?.lowStockQty || 10);
            return currentQty <= lowStockQty;
        });

        const data = filtered.map((barcode, index) => {
            const qty = Number(barcode.availableQty || 0);
            const lowStockQty = Number(barcode.productId?.lowStockQty || 10);

            const unit = barcode.unit || barcode.productId?.unit || "pcs";
            const unitValue = Number(barcode.unitValue || barcode.productId?.unitValue || 1);

            let totalUnitText = "";

            if (unit === "kg") {
                totalUnitText = `${formatQty(qty * unitValue)} kg`;
            } else if (unit === "g") {
                totalUnitText = `${formatQty((qty * unitValue) / 1000)} kg`;
            } else {
                totalUnitText = `${formatQty(qty)} pcs`;
            }

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

                unit,
                unitValue,
                totalUnitText,

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

        const formatQty = (value) => {
            const num = Number(value || 0);
            return Number.isInteger(num)
                ? String(num)
                : String(Number(num.toFixed(2)));
        };

        const data = barcodes.map((barcode, index) => {
            const qty = Number(barcode.availableQty || 0);
            const unit = barcode.unit || barcode.productId?.unit || "pcs";
            const unitValue = Number(barcode.unitValue || barcode.productId?.unitValue || 1);

            let totalUnitText = "";

            if (unit === "kg") {
                totalUnitText = `${formatQty(qty * unitValue)} kg`;
            } else if (unit === "g") {
                totalUnitText = `${formatQty((qty * unitValue) / 1000)} kg`;
            } else {
                totalUnitText = `${formatQty(qty)} pcs`;
            }

            return {
                sno: index + 1,
                productId: barcode.productId?._id || "",
                productName: barcode.productId?.name || "",
                brand: barcode.productId?.brand || "",

                barcode: barcode.code || "",
                currentStock: qty,
                totalProductStock: Number(barcode.productId?.stock || 0),

                unit,
                unitValue,
                totalUnitText,

                mrp: barcode.mrp || 0,
                costPrice: barcode.costPrice || 0,
                sellingPrice: barcode.sellingPrice || 0,

                gstRate: Number(
                    barcode.gstRate ||
                    barcode.productId?.gstRate ||
                    0
                ),

                status: "Out Of Stock"
            };
        });

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