const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
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

            const {
                customerId,
                items,
                paymentMethod,
                discount = 0
            } = req.body;

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Items required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            let subTotal = 0;
            let gstAmount = 0;

            const processedItems = [];

            for (const item of items) {

                const qty = Number(item.qty);

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

                if (product.stock < qty) {
                    return res.status(400).json({
                        success: false,
                        message: `${product.name} insufficient stock`
                    });
                }

                const total = qty * product.sellingPrice;

                subTotal += total;

                gstAmount +=
                    (total * Number(product.gst || 0)) / 100;

                processedItems.push({
                    productId: product._id,
                    qty,
                    price: product.sellingPrice,
                    total
                });

                await Product.updateOne(
                    {
                        _id: product._id
                    },
                    {
                        $inc: {
                            stock: -qty
                        }
                    }
                );
            }

            const grandTotal =
                subTotal + gstAmount - Number(discount);

            const invoiceNumber =
                "INV-" + Date.now();

            const invoice = await SalesInvoice.create({
                invoiceNumber,
                customerId,
                items: processedItems,
                subTotal,
                gstAmount,
                discount,
                grandTotal,
                paymentMethod,
                ...hierarchy,
                createdBy: req.user.userId
            });

            res.status(201).json({
                success: true,
                message: "Sales invoice created successfully",
                data: invoice
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

            const { page = 1, limit = 10 } = req.query;

            const hierarchy = attachHierarchy(req.user);

            const invoices = await SalesInvoice.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("customerId", "name phone")
                .populate("items.productId", "name")
                .skip((Number(page) - 1) * Number(limit))
                .limit(Number(limit))
                .sort({ createdAt: -1 });

            const total =
                await SalesInvoice.countDocuments({
                    superAdminId: hierarchy.superAdminId
                });

            res.json({
                success: true,
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: invoices
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
    "/list",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { page = 1, limit = 10, search = "", status = "" } = req.query;

            const hierarchy = attachHierarchy(req.user);

            const query = {
                superAdminId: hierarchy.superAdminId
            };

            if (status && status.trim() !== "") {
                query.status = status.trim().toLowerCase();
            }


            if (search) {
                query.invoiceNumber = {
                    $regex: search,
                    $options: "i"
                };
            }

            const sales = await SalesInvoice.find(query)
                .populate("customerId", "name phone")
                .populate("items.productId", "name sellingPrice")
                .populate("createdBy", "name role")
                .skip((Number(page) - 1) * Number(limit))
                .limit(Number(limit))
                .sort({ createdAt: -1 });

            const total = await SalesInvoice.countDocuments(query);

            res.json({
                success: true,
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: sales
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



router.get("/:id", verifyToken, authorize("super_admin", "admin", "cashier"), async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);

        const invoice = await SalesInvoice.findOne({
            _id: req.params.id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "name phone")
            .populate("items.productId", "name");

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: "Invoice not found"
            });
        }

        res.json({
            success: true,
            data: invoice
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
    "/list/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const hierarchy = attachHierarchy(req.user);

            let query = {
                superAdminId: hierarchy.superAdminId
            };

            if (mongoose.Types.ObjectId.isValid(id)) {
                query._id = id;
            } else {
                query.invoiceNumber = id.startsWith("INV-")
                    ? id
                    : `INV-${id}`;
            }

            const invoice = await SalesInvoice.findOne(query)
                .populate("customerId", "name phone email address")
                .populate("items.productId", "name sellingPrice gst barcode")
                .populate("createdBy", "name role");

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: "Sales invoice not found"
                });
            }

            res.json({
                success: true,
                data: invoice
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
    "/details/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const hierarchy = attachHierarchy(req.user);

            const query = {
                superAdminId: hierarchy.superAdminId
            };

            if (mongoose.Types.ObjectId.isValid(id)) {
                query._id = id;
            } else {
                query.invoiceNumber = id.startsWith("INV-")
                    ? id
                    : `INV-${id}`;
            }

            const invoice = await SalesInvoice.findOne(query)
                .populate("customerId", "name phone email address")
                .populate("items.productId", "name sellingPrice gst")
                .populate("createdBy", "name role");

            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: "Sales invoice not found"
                });
            }

            res.json({
                success: true,
                data: invoice
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