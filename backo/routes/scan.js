const express = require("express");
const router = express.Router();

const Barcode = require("../models/Barcode");
const Product = require("../models/Product");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { successResponse, errorResponse } = require("../utils/response");



router.get("/:code",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { code } = req.params;
            const { superAdminId } = req.user;

            const barcode = await Barcode.findOne({
                code,
                superAdminId: superAdminId
            });

            if (!barcode) {
                return errorResponse(res, "Invalid barcode", 404);
            }

           
            const product = await Product.findOne({
                _id: barcode.productId,
                superAdminId: superAdminId
            });

            if (!product) {
                return errorResponse(res, "Product not found", 404);
            }

            const gstAmount = (product.price * product.gst) / 100;
            const finalPrice = product.price + gstAmount;

            return successResponse(res, {
                product: {
                    id: product._id,
                    name: product.name,
                    price: product.price,
                    gst: product.gst,
                    gstAmount,
                    finalPrice
                },
                barcode: {
                    id: barcode._id,
                    code: barcode.code,
                    isSold: barcode.isSold
                }
            }, "Scan successful");

        } catch (err) {
            console.error(err);
            return errorResponse(res, "Server error", 500);
        }
    }
);

module.exports = router;