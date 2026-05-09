const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const { attachHierarchy } = require("../utils/hierarchy");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const Supplier = require("../models/Supplier");




const getNextPurchaseId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "purchase" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};


router.post(
    "/purchase",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { supplierId, items } = req.body;

            if (!supplierId || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier and items are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            let totalAmount = 0;
            const processedItems = [];

            
            const supplier = await Supplier.findOne({
                _id: supplierId,
                superAdminId: hierarchy.superAdminId
            });

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            for (let item of items) {

                const productId = item.productId;
                const qty = Number(item.qty);
                const costPrice = Number(item.costPrice);

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid quantity"
                    });
                }

                const product = await Product.findOne({
                    _id: productId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                totalAmount += qty * costPrice;

                const receivedQty = 0;
                const pendingQty = qty;

                processedItems.push({
                    productId,
                    qty,
                    costPrice,
                    receivedQty,
                    pendingQty
                });
            }

            const purchase = await Purchase.create({

                supplierId,
                items: processedItems,
                totalAmount,
                status: "pending",
                ...hierarchy
            });

            return res.status(201).json({
                success: true,
                message: "Purchase created successfully",
                data: purchase
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




router.get(
    "/purchase",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const purchases = await Purchase.find({
                superAdminId: superAdminId
            })
                .populate("supplierId")
                .sort({ createdAt: -1 });

            const totalPurchases = purchases.length;


            const totalAmount = purchases.reduce(
                (sum, p) => sum + (p.totalAmount || 0),
                0
            );


            const totalItems = purchases.reduce(
                (sum, p) => sum + (p.items?.length || 0),
                0
            );

            res.json({
                success: true,
                data: purchases,


                count: {
                    totalPurchases,
                    totalAmount,
                    totalItems
                }
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);



router.get("/purchase/:id", verifyToken, authorize("super_admin", "admin", "cashier"), async (req, res) => {
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



router.put(
    "/purchase/:id/ack",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { superAdminId } = req.user;


            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid purchase id"
                });
            }


            const purchase = await Purchase.findOne({
                _id: id,
                superAdminId
            });

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }


            purchase.status = "acknowledged";
            await purchase.save();

            return res.json({
                success: true,
                message: "Purchase acknowledged successfully",
                data: purchase
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



router.post("/purchase/:id/return", verifyToken, authorize("super_admin", "admin"), async (req, res) => {

    const purchase = await Purchase.findOne({
        _id: req.params.id,
        superAdminId: req.user.superAdminId
    });

    if (!purchase) return res.status(404).json({ message: "Not found" });

    purchase.status = "returned";


    for (let item of purchase.items) {
        await Product.updateOne(
            { _id: item.productId },
            { $inc: { stock: -item.qty } }
        );
    }

    await purchase.save();

    res.json({ success: true });
}
);




router.get(
    "/purchase/reorder",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const products = await Product.find({
                superAdminId,
                $expr: { $lte: ["$stock", "$reorderLevel"] }
            });

            const result = products.map(p => ({
                productId: p._id,
                name: p.name,
                stock: p.stock,
                reorderLevel: p.reorderLevel,
                reorderQty: p.reorderLevel - p.stock
            }));

            res.json({
                success: true,
                count: result.length,
                data: result
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);






router.get(
    "/purchase/:id/barcodes",
    verifyToken,
    async (req, res) => {
        const purchase = await Purchase.findById(req.params.id);

        const barcodes = await Barcode.find({
            productId: { $in: purchase.items.map(i => i.productId) }
        });

        res.json({ success: true, barcodes });
    }
);

module.exports = router;