const Barcode = require("../models/barcode");
const Product = require("../models/Product");
const PriceLevel = require("../models/price_level");
const { attachHierarchy } = require("../utils/hierarchy");
const { successResponse, errorResponse } = require("../utils/response");




exports.scanProduct = async (req, res) => {
    try {
        const code = String(req.params.code || "").trim();

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Barcode is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const barcode = await Barcode.findOne({
            code,
            superAdminId: hierarchy.superAdminId,

        }).populate("productId");



        const product = barcode.productId;

        const priceLevel = await PriceLevel.findOne({
            productId: product._id,
            superAdminId: hierarchy.superAdminId,
            isActive: true
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.json({
            success: true,
            message: "Product scanned successfully",
            data: {
                barcode: barcode.code,

                productId: product._id,
                productName: product.name,
                brand: product.brand || "",

                qty: barcode.qty || 1,
                availableQty: barcode.availableQty || 1,

                hsnCode: product.hsnCode || "",
                gstRate: product.gstRate || 0,

                flavor: barcode.flavor || "",
                litters: barcode.litters || "",

                mrp: barcode.mrp || product.mrp || 0,
                sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,
                priceLevel: priceLevel || null,

                isSold: barcode.isSold
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}