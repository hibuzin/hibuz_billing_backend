const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const Counter = require("../models/Counter");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const getNextPurchaseId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "purchase" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};


router.post("/",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { supplierId, items } = req.body;
            const { userId, role, superAdminId } = req.user;

            if (!supplierId || !items || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier and items are required",
                });
            }

            let totalAmount = 0;

            for (const item of items) {
                const { productId, qty, costPrice } = item;

                if (!productId || qty <= 0 || costPrice < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid item data",
                    });
                }

                
                const product = await Product.findOne({
                    _id: productId,
                    superAdminId: superAdminId
                });

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                totalAmount += qty * costPrice;

                
                await Product.updateOne(
                    {
                        _id: productId,
                        superAdminId: superAdminId
                    },
                    {
                        $inc: { stock: qty }
                    }
                );
            }

            const purchaseId = await getNextPurchaseId();

            const purchase = await Purchase.create({
                purchaseId,
                supplierId,
                items,
                totalAmount,

                createdBy: userId,
                role,

                superAdminId: superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Purchase created successfully",
                purchase
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message,
            });
        }
    }
);


router.get("/",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const data = await Purchase.find({
                superAdminId: superAdminId   
            })
                .populate("supplierId")
                .populate("items.productId")
                .sort({ createdAt: -1 });

            res.json({
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
);

router.get("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const data = await Purchase.findOne({
                _id: req.params.id,
                superAdminId: superAdminId   
            })
                .populate("supplierId")
                .populate("items.productId");

            if (!data) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            res.json({
                success: true,
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
);

module.exports = router;