const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Purchase = require("../models/Purchase");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");


router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const products = await Product.find({
                superAdminId: hierarchy.superAdminId
            }).select("name brand stock mrps flavor liters categoryId");

            res.json({
                success: true,
                count: products.length,
                data: products
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);


router.get(
    "/product/:productId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const product = await Product.findOne({
                _id: req.params.productId,
                superAdminId: hierarchy.superAdminId
            }).select("name brand stock mrps flavor liters categoryId");

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            res.json({
                success: true,
                data: product
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);


router.get(
    "/purchase/:purchaseId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const purchase = await Purchase.findOne({
                _id: req.params.purchaseId,
                superAdminId: hierarchy.superAdminId
            }).populate("items.productId", "name brand stock mrps flavor liters");

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            const items = purchase.items.map(item => ({
                productId: item.productId._id,
                name: item.productId.name,
                brand: item.productId.brand,
                currentStock: item.productId.stock || 0,
                purchaseQty: item.qty,
                receivedQty: item.receivedQty || 0,
                pendingQty: item.pendingQty || 0,
                mrp: item.mrp,
                flavor: item.flavor,
                liters: item.liters
            }));

            res.json({
                success: true,
                purchaseId: purchase._id,
                supplierId: purchase.supplierId,
                totalAmount: purchase.totalAmount,
                data: items
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);


router.get(
    "/low-stock",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);
            const limit = Number(req.query.limit || 5);

            const products = await Product.find({
                superAdminId: hierarchy.superAdminId,
                stock: { $lte: limit }
            }).select("name brand stock mrps flavor liters");

            res.json({
                success: true,
                limit,
                count: products.length,
                data: products
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);

module.exports = router;