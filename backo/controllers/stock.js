const Product = require("../models/product");
const Purchase = require("../models/purchase");
const Barcode = require("../models/barcode");
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

        purchases.forEach((purchase) => {
            purchase.items.forEach((item) => {
                const currentStock = Number(item.productId?.stock || 0);

                data.push({
                    purchaseId: purchase._id,
                    invoiceNo: purchase.invoiceNo,
                    invoiceDate: purchase.invoiceDate,

                    productId: item.productId?._id || "",
                    productName: item.productId?.name || "",
                    brand: item.productId?.brand || item.brand || "",

                    currentStock,

                    mrp: item.mrp || 0,
                    costPrice: item.costPrice || 0,
                    sellingPrice: item.sellingPrice || 0,

                    flavor: item.flavor || "",
                    litters: item.litters || "",
                    kg: item.kg || "",

                    purchasedQty: item.qty || 0,
                    receivedQty: item.receivedQty || 0,
                    pendingQty: item.pendingQty || 0,

                    status:
                        currentStock <= 0
                            ? "Out Of Stock"
                            : currentStock <= 10
                                ? "Low Stock"
                                : "Available"
                });
            });
        });

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
}




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

        purchases.forEach((purchase) => {
            purchase.items.forEach((item) => {
                const product = item.productId;
                if (!product) return;

                const key = `${product._id}_${item.mrp}_${item.costPrice}_${item.sellingPrice}_${item.flavor}_${item.litters}`;

                if (!stockMap[key]) {
                    const currentStock = Number(product.stock || 0);

                    stockMap[key] = {
                        productId: product._id,
                        productName: product.name || "",
                        brand: product.brand || item.brand || "",

                        currentStock,

                        mrp: Number(item.mrp || 0),
                        costPrice: Number(item.costPrice || 0),
                        sellingPrice: Number(item.sellingPrice || 0),

                        flavor: item.flavor || "",
                        litters: item.litters || "",
                        kg: item.kg || "",

                        costValue: 0,
                        sellingValue: 0,
                        mrpValue: 0
                    };
                }
            });
        });

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

        const purchases = await Purchase.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("items.productId", "name brand stock")
            .sort({ createdAt: -1 });

        const data = [];

        purchases.forEach((purchase) => {
            purchase.items.forEach((item) => {
                const productName = item.productId?.name || "";
                const brand = item.productId?.brand || item.brand || "";

                const matched =
                    productName.toLowerCase().includes(search.toLowerCase()) ||
                    brand.toLowerCase().includes(search.toLowerCase());

                if (matched) {
                    data.push({
                        productId: item.productId?._id || item.productId,
                        productName,
                        brand,
                        mrp: item.mrp,
                        flavor: item.flavor || "",
                        litters: item.litters || "",

                        currentStock: Number(item.productId?.stock || 0)
                    });
                }
            });
        });

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
}

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

        purchases.forEach((purchase) => {
            purchase.items.forEach((item) => {
                if (String(item.productId?._id) !== String(productId)) return;

                const qty = Number(item.qty || 0);
                const receivedQty = Number(item.receivedQty || 0);
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

                    currentStock: Number(product.stock || 0),

                    mrp: item.mrp || 0,
                    costPrice,
                    sellingPrice,

                    flavor: item.flavor || "",
                    litters: item.litters || "",
                    kg: item.kg || "",

                    purchasedQty: qty,
                    receivedQty,
                    pendingQty,

                    status:
                        Number(product.stock || 0) <= 0
                            ? "Out Of Stock"
                            : Number(product.stock || 0) <= 10
                                ? "Low Stock"
                                : "Available"
                });
            });
        });

        return res.status(200).json({
            success: true,
            product: {
                productId: product._id,
                productName: product.name,
                brand: product.brand || "",
                currentStock: Number(product.stock || 0),
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

exports.lowstockcheck = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const limit = Number(req.query.limit || 10);

        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            availableQty: { $gt: 0, $lte: limit }
        })
            .populate(
                "productId",
                "name brand stock categoryId gstRate mrps flavor litters"
            )
            .sort({ availableQty: 1 });

        let totalLowStockQty = 0;

        const data = barcodes.map((barcode, index) => {
            const qty = Number(barcode.availableQty || 0);

            totalLowStockQty += qty;

            return {
                sno: index + 1,
                productId: barcode.productId?._id || "",
                productName: barcode.productId?.name || "",
                brand: barcode.productId?.brand || "",

                barcode: barcode.code || "",
                currentStock: qty,
                totalProductStock: Number(barcode.productId?.stock || 0),

                mrp: barcode.mrp || 0,
                costPrice: barcode.costPrice || 0,
                sellingPrice: barcode.sellingPrice || 0,

                flavor: barcode.flavor || "",
                litters: barcode.litters || "",

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
            limit,

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
                "name brand stock categoryId gstRate mrps flavor litters"
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

            mrp: barcode.mrp || 0,
            costPrice: barcode.costPrice || 0,
            sellingPrice: barcode.sellingPrice || 0,

            flavor: barcode.flavor || "",
            litters: barcode.litters || "",

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