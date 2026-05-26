const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const Return = require("../models/return");
const Purchase = require("../models/purchase");
const Product = require("../models/Product");
const Supplier = require("../models/supplier");
const { attachHierarchy } = require("../utils/hierarchy");



router.post("/return", 
    verifyToken, 
    authorize("super_admin", "admin", "cashier"),
     async (req, res) => {
    try {
        const { purchaseId, items, supplierId } = req.body;

        if (!purchaseId || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "purchaseId and items are required"
            });
        }

        const hierarchy = attachHierarchy(req.user);


        const purchase = await Purchase.findOne({
            _id: purchaseId,
            superAdminId: hierarchy.superAdminId
        });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        const finalSupplierId = supplierId || purchase.supplierId;

        const supplier = await Supplier.findOne({
            _id: finalSupplierId,
            superAdminId: hierarchy.superAdminId
        });

        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found"
            });
        }

        const processedItems = [];

        for (const item of items) {
            const qty = Number(item.qty);

            if (!item.productId || isNaN(qty) || qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid productId and qty required"
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

            processedItems.push({
                productId: item.productId,
                qty,
                reason: item.reason || ""
            });
        }

        const request = await Return.create({
            purchaseId,
            supplierId: finalSupplierId,
            items: processedItems,
            status: "pending",
            ...hierarchy,
            createdBy: req.user.userId
        });

        res.status(201).json({
            success: true,
            message: "Purchase return request created successfully",
            data: request
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


router.get("/return", verifyToken, authorize("super_admin", "admin", "cashier"), async (req, res) => {
    try {

        const { page = 1, limit = 10, status = "" } = req.query;

        const { userId, role, superAdminId } = req.user;

        const finalSuperAdminId =
            role === "super_admin" ? userId : superAdminId;


        const query = {
            superAdminId: finalSuperAdminId
        };

        if (status) {
            query.status = status;
        }

        const requests = await Return.find(query)
            .populate("purchaseId")
            .populate("supplierId", "name phone")
            .populate("items.productId", "name sellingPrice stock")
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .sort({ createdAt: -1 });

        const total = await Return.countDocuments(query);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: requests
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

router.get("/return/:id", verifyToken, authorize("super_admin", "admin", "cashier"), async (req, res) => {
    try {

        const { id } = req.params;

        const { userId, role, superAdminId } = req.user;

        const finalSuperAdminId =
            role === "super_admin" ? userId : superAdminId;


        const request = await Return.findOne({
            _id: id,
            superAdminId: finalSuperAdminId
        })
            .populate("purchaseId")
            .populate("supplierId", "name phone email")
            .populate(
                "items.productId",
                "name sellingPrice costPrice stock"
            )
            .lean();

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Purchase return request not found"
            });
        }

        res.json({
            success: true,
            data: request
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

router.put("/return/:id/approve", verifyToken, authorize("super_admin", "admin"), async (req, res) => {
    try {

        const { id } = req.params;

        const { userId, role, superAdminId } = req.user;

        const finalSuperAdminId =
            role === "super_admin" ? userId : superAdminId;


        const request = await Return.findOne({
            _id: id,
            superAdminId: finalSuperAdminId
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Purchase return request not found"
            });
        }

        if (request.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Request already ${request.status}`
            });
        }


        for (const item of request.items) {

            const product = await Product.findOne({
                _id: item.productId,
                superAdminId: finalSuperAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            if (product.stock < item.qty) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} insufficient stock`
                });
            }

            await Product.updateOne(
                {
                    _id: item.productId,
                    superAdminId: finalSuperAdminId
                },
                {
                    $inc: {
                        stock: -item.qty
                    }
                }
            );
        }

        request.status = "approved";

        await request.save();

        res.json({
            success: true,
            message: "Purchase return request approved successfully",
            data: request
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


router.put("/return/:id/reject", verifyToken, authorize("super_admin", "admin"), async (req, res) => {
    try {

        const { id } = req.params;

        const { userId, role, superAdminId } = req.user;

        const finalSuperAdminId =
            role === "super_admin" ? userId : superAdminId;


        const request = await Return.findOne({
            _id: id,
            superAdminId: finalSuperAdminId
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Purchase return request not found"
            });
        }

        if (request.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Request already ${request.status}`
            });
        }

        request.status = "rejected";

        await request.save();

        res.json({
            success: true,
            message: "Purchase return request rejected successfully",
            data: request
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