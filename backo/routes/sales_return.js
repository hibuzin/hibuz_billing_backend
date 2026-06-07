const express = require("express");
const router = express.Router();

const SalesReturn = require("../models/sales_return");
const SalesInvoice = require("../models/sales_Invoice");
const Product = require("../models/product");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");

router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { invoiceId, items } = req.body;

            if (!invoiceId || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "invoiceId and items are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const invoice = await SalesInvoice.findOne({
                _id: invoiceId,
                superAdminId: hierarchy.superAdminId,
                status: "completed"
            });

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: "Sales invoice not found"
                });
            }

            let totalReturnAmount = 0;
            const processedItems = [];

            for (const item of items) {
                const qty = Number(item.qty);

                if (!item.productId || isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Valid productId and qty required"
                    });
                }

                const invoiceItem = invoice.items.find(
                    x => x.productId.toString() === item.productId.toString()
                );

                if (!invoiceItem) {
                    return res.status(400).json({
                        success: false,
                        message: "Product not found in this invoice"
                    });
                }

                if (qty > invoiceItem.qty) {
                    return res.status(400).json({
                        success: false,
                        message: "Return qty cannot be greater than sold qty"
                    });
                }

                const amount = qty * invoiceItem.price;
                totalReturnAmount += amount;

                await Product.updateOne(
                    {
                        _id: item.productId,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: { stock: qty }
                    }
                );

                processedItems.push({
                    productId: item.productId,
                    qty,
                    reason: item.reason || "",
                    amount
                });
            }

            const salesReturn = await SalesReturn.create({
                invoiceId,
                items: processedItems,
                totalReturnAmount,
                ...hierarchy,
                createdBy: req.user.userId
            });

            res.status(201).json({
                success: true,
                message: "Sales return completed successfully",
                data: salesReturn
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
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const returns = await SalesReturn.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("invoiceId", "invoiceNumber grandTotal")
                .populate("items.productId", "name sellingPrice")
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                count: returns.length,
                data: returns
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
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const salesReturn = await SalesReturn.findOne({
                _id: req.params.id,
                superAdminId: hierarchy.superAdminId
            })
                .populate("invoiceId", "invoiceNumber grandTotal")
                .populate("items.productId", "name sellingPrice");

            if (!salesReturn) {
                return res.status(404).json({
                    success: false,
                    message: "Sales return not found"
                });
            }

            res.json({
                success: true,
                data: salesReturn
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