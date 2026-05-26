const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Customer = require("../models/customer");
const HoldBill = require("../models/hold_bill");
const Product = require("../models/Product");
const Counter = require("../models/counter");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");

const getNextHoldNo = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "hold_bill" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    return counter.seq;
};



router.post(
    "/hold",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { customerId, customerName, items, note } = req.body;

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Items are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            let totalAmount = 0;
            const processedItems = [];

            for (const item of items) {
                const productId = item.productId;
                const qty = Number(item.qty);

                if (!mongoose.Types.ObjectId.isValid(productId)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid product id"
                    });
                }

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid quantity"
                    });
                }

                const product = await Product.findOne({
                    _id: productId,
                    superAdminId: hierarchy.superAdminId
                }).populate("categoryId", "name");

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const sellingPrice = Number(item.sellingPrice || item.price || 0);
                const mrp = Number(item.mrp || sellingPrice);
                const gst = Number(item.gst || 0);

                if (sellingPrice <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid selling price"
                    });
                }

                const subtotal = qty * sellingPrice;
                totalAmount += subtotal;

                processedItems.push({
                    productId: product._id,
                    name: product.name,
                    brand: product.brand || "",
                    categoryId: product.categoryId?._id || null,
                    categoryName: product.categoryId?.name || "",
                    flavor: item.flavor || "",
                    litters: item.litters || "",
                    qty,
                    mrp,
                    sellingPrice,
                    gst,
                    barcode: item.barcode || "",
                    subtotal
                });
            }

            const holdNo = await getNextHoldNo();

            const holdBill = await HoldBill.create({
                holdNo,
                customerId: customerId || null,
                customerName: customerName || "Walk-in Customer",
                items: processedItems,
                totalAmount,
                note: note || "",
                ...hierarchy,
                createdBy: req.user.userId
            });

            res.status(201).json({
                success: true,
                message: "Bill held successfully",
                data: holdBill
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
    "/hold",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const bills = await HoldBill.find({
                superAdminId: hierarchy.superAdminId,
                status: "hold"
            })
                .populate("customerId", "name phone")
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                count: bills.length,
                data: bills
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
    "/hold/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hold bill id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const bill = await HoldBill.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId,
                status: "hold"
            }).populate("customerId", "name phone");

            if (!bill) {
                return res.status(404).json({
                    success: false,
                    message: "Hold bill not found"
                });
            }

            res.json({
                success: true,
                message: "Hold bill resumed",
                data: bill
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



router.put(
    "/hold/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { customerId, customerName, items, note } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hold bill id"
                });
            }

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Items are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const holdBill = await HoldBill.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId,
                status: "hold"
            });

            if (!holdBill) {
                return res.status(404).json({
                    success: false,
                    message: "Hold bill not found"
                });
            }

            let totalAmount = 0;
            const processedItems = [];

            for (const item of items) {
                const product = await Product.findOne({
                    _id: item.productId,
                    superAdminId: hierarchy.superAdminId
                }).populate("categoryId", "name");

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const qty = Number(item.qty);
                const sellingPrice = Number(item.sellingPrice || item.price || 0);
                const mrp = Number(item.mrp || sellingPrice);
                const gst = Number(item.gst || 0);

                const subtotal = qty * sellingPrice;
                totalAmount += subtotal;

                processedItems.push({
                    productId: product._id,
                    name: product.name,
                    brand: product.brand || "",
                    categoryId: product.categoryId?._id || null,
                    categoryName: product.categoryId?.name || "",
                    flavor: item.flavor || "",
                    litters: item.litters || "",
                    qty,
                    mrp,
                    sellingPrice,
                    gst,
                    barcode: item.barcode || "",
                    subtotal
                });
            }

            holdBill.customerId = customerId || null;
            holdBill.customerName = customerName || "Walk-in Customer";
            holdBill.items = processedItems;
            holdBill.totalAmount = totalAmount;
            holdBill.note = note || "";

            await holdBill.save();

            res.json({
                success: true,
                message: "Hold bill updated successfully",
                data: holdBill
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



router.delete(
    "/hold/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hold bill id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const bill = await HoldBill.findOneAndUpdate(
                {
                    _id: id,
                    superAdminId: hierarchy.superAdminId,
                    status: "hold"
                },
                {
                    status: "cancelled"
                },
                {
                    new: true
                }
            );

            if (!bill) {
                return res.status(404).json({
                    success: false,
                    message: "Hold bill not found"
                });
            }

            res.json({
                success: true,
                message: "Hold bill cancelled successfully"
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



router.put(
    "/hold/:id/billed",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hold bill id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const bill = await HoldBill.findOneAndUpdate(
                {
                    _id: id,
                    superAdminId: hierarchy.superAdminId,
                    status: "hold"
                },
                {
                    status: "billed"
                },
                {
                    new: true
                }
            );

            if (!bill) {
                return res.status(404).json({
                    success: false,
                    message: "Hold bill not found"
                });
            }

            res.json({
                success: true,
                message: "Hold bill marked as billed",
                data: bill
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