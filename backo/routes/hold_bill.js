const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Customer = require("../models/customer");
const Bill = require("../models/bill");
const Barcode = require("../models/barcode");
const HoldBill = require("../models/hold_bill");
const Product = require("../models/product");
const Counter = require("../models/counter");
const DuePayment = require("../models/due_payment");

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

            const {
                customerId,
                redeemPoints = 0,
                paymentType = "paid",
                paidAmount = 0,
                dueDate
            } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hold bill id"
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

            const result = await Counter.findOneAndUpdate(
                { name: `invoice_${hierarchy.superAdminId}` },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );

            const invoiceNo = `INV-${String(result.seq).padStart(5, "0")}`;

            let subTotal = 0;
            let totalGST = 0;
            const items = [];

            for (const item of holdBill.items) {
                const qty = Number(item.qty || 1);

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid quantity"
                    });
                }

                const product = await Product.findOne({
                    _id: item.productId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const barcode = await Barcode.findOne({
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId,
                    availableQty: { $gte: qty }
                });

                if (!barcode) {
                    return res.status(400).json({
                        success: false,
                        message: `${product.name} stock not available`
                    });
                }

                const price = Number(barcode.sellingPrice || 0);
                const gstRate = Number(barcode.gstRate || product.gstRate || 0);

                if (price <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid selling price for product: ${product.name}`
                    });
                }

                const taxableAmount = price * qty;
                const gstAmount = Number(((taxableAmount * gstRate) / 100).toFixed(2));
                const finalPrice = Number((taxableAmount + gstAmount).toFixed(2));

                subTotal += taxableAmount;
                totalGST += gstAmount;

                items.push({
                    productId: product._id,
                    barcodeId: barcode._id,
                    barcode: barcode.code,
                    productName: product.name || "",
                    name: product.name || "",
                    brand: product.brand || "",
                    flavor: barcode.flavor || "",
                    litters: barcode.litters || "",
                    qty,
                    mrp: barcode.mrp || 0,
                    price,
                    gstRate,
                    gstAmount,
                    finalPrice
                });

                barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);
                await barcode.save();

                const stockUpdate = await Product.updateOne(
                    {
                        _id: product._id,
                        superAdminId: hierarchy.superAdminId,
                        stock: { $gte: qty }
                    },
                    {
                        $inc: { stock: -qty }
                    }
                );

                if (stockUpdate.modifiedCount === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `${product.name} stock update failed`
                    });
                }
            }

            let discount = 0;
            let customer = null;

            const finalCustomerId = customerId || holdBill.customerId;

            if (finalCustomerId) {
                customer = await Customer.findOne({
                    customerId: finalCustomerId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!customer) {
                    return res.status(404).json({
                        success: false,
                        message: "Customer not found"
                    });
                }

                if (Number(redeemPoints) > 0) {
                    if (Number(customer.loyaltyPoints || 0) < Number(redeemPoints)) {
                        return res.status(400).json({
                            success: false,
                            message: "Not enough loyalty points"
                        });
                    }

                    discount = Number(redeemPoints);
                    customer.loyaltyPoints -= discount;
                }
            }

            const grandTotal = Number((subTotal + totalGST - discount).toFixed(2));
            const earnedPoints = Math.floor(grandTotal / 100);

            if (customer) {
                customer.loyaltyPoints = Number(customer.loyaltyPoints || 0) + earnedPoints;
                customer.totalSpent = Number(customer.totalSpent || 0) + grandTotal;
                await customer.save();
            }

            if ((paymentType === "partial" || paymentType === "due") && !customer) {
                return res.status(400).json({
                    success: false,
                    message: "Customer required for due payment"
                });
            }

            const bill = await Bill.create({
                invoiceNo,
                items,
                summary: {
                    subTotal,
                    totalGST,
                    discount,
                    grandTotal
                },
                customerId: customer ? customer._id : null,
                paymentMethod: "cash",
                paymentStatus:
                    paymentType === "paid"
                        ? "paid"
                        : paymentType === "partial"
                            ? "partial"
                            : "due",
                cashier: req.user.userId || req.user.id,
                createdBy: req.user.userId || req.user.id,
                role: req.user.role,
                ...hierarchy
            });

            if (paymentType === "partial" || paymentType === "due") {
                const paid = paymentType === "due" ? 0 : Number(paidAmount || 0);

                if (paid >= grandTotal) {
                    return res.status(400).json({
                        success: false,
                        message: "Paid amount must be less than grand total for due/partial"
                    });
                }

                await DuePayment.create({
                    customerId: customer._id,
                    billId: bill._id,
                    totalAmount: grandTotal,
                    paidAmount: paid,
                    pendingAmount: Number((grandTotal - paid).toFixed(2)),
                    status: paymentType === "partial" ? "partial" : "due",
                    dueDate,
                    createdBy: req.user.userId || req.user.id,
                    ...hierarchy
                });
            }

            holdBill.status = "billed";
            holdBill.billId = bill._id;
            await holdBill.save();

            return res.json({
                success: true,
                message: "Hold bill converted to bill successfully",
                data: {
                    billId: bill._id,
                    invoiceNo: bill.invoiceNo,
                    paymentStatus: bill.paymentStatus,
                    paymentType,
                    paidAmount: paymentType === "due" ? 0 : Number(paidAmount || 0),
                    pendingAmount:
                        paymentType === "paid"
                            ? 0
                            : Number((grandTotal - Number(paidAmount || 0)).toFixed(2)),
                    items,
                    summary: bill.summary,
                    loyalty: {
                        used: discount,
                        earned: earnedPoints,
                        remaining: customer ? customer.loyaltyPoints : 0
                    }
                }
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);



module.exports = router;