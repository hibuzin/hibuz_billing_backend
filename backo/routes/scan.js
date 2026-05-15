const express = require("express");
const router = express.Router();

const Barcode = require("../models/Barcode");
const Product = require("../models/Product");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");
const { successResponse, errorResponse } = require("../utils/response");

router.get(
    "/:code",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
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
                isSold: false
            }).populate("productId");

            if (!barcode) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found or already sold"
                });
            }

            const product = barcode.productId;

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

                    hsnCode: product.hsnCode || "",
                    gstRate: product.gstRate || 0,

                    flavor: barcode.flavor || "",
                    liters: barcode.liters || "",

                    mrp: barcode.mrp || product.mrp || 0,
                    sellingPrice: barcode.sellingPrice || product.sellingPrice || 0,

                    stock: product.stock || 0,
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
);


module.exports = router;