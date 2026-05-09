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

            const code = String(req.params.code).trim();

           
            const hierarchy = attachHierarchy(req.user);

            
            const barcode = await Barcode.findOne({
                code,
                superAdminId: hierarchy.superAdminId
            });

            if (!barcode) {
                return errorResponse(
                    res,
                    "Invalid barcode",
                    404
                );
            }

           
            const product = await Product.findOne({
                _id: barcode.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return errorResponse(
                    res,
                    "Product not found",
                    404
                );
            }

            const price = Number(product.sellingPrice);
            const gst = Number(product.gst || 0);

            const gstAmount = (price * gst) / 100;
            const finalPrice = price + gstAmount;

            return successResponse(
                res,
                {
                    product: {
                        id: product._id,
                        name: product.name,
                        sellingPrice: price,
                        gst,
                        gstAmount,
                        finalPrice,
                        stock: product.stock
                    },

                    barcode: {
                        id: barcode._id,
                        code: barcode.code,
                        isSold: barcode.isSold
                    }
                },
                "Scan successful"
            );

        } catch (err) {

            console.error("SCAN ERROR:", err);

            return res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);

module.exports = router;