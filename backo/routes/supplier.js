const express = require("express");
const router = express.Router();

const Supplier = require("../models/supplier");
const Counter = require("../models/counter");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");

const getNextSupplierId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "supplier" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return `SUP${String(counter.seq).padStart(3, "0")}`;
};

router.post(
    "/add",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const {
                supplierName,
                mobile,
                gstNumber,
                email,
                address,
                city,
                state,
                pincode,
                contactPerson
            } = req.body;

            if (!supplierName || !mobile) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier name and mobile number are required"
                });
            }

            const supplierId = await getNextSupplierId();

            const supplier = await Supplier.create({
                supplierId,
                supplierName,
                mobile,
                gstNumber,
                email,
                address,
                city,
                state,
                pincode,
                superAdminId: hierarchy.superAdminId,
                adminId: hierarchy.adminId || null,
                createdBy: hierarchy.userId || hierarchy.adminId || hierarchy.superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Supplier created successfully",
                data: supplier
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
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

            const suppliers = await Supplier.find({
                superAdminId: hierarchy.superAdminId,
                isActive: true
            }).sort({ createdAt: -1 });

            res.json({
                success: true,
                count: suppliers.length,
                data: suppliers
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });
        }
    }
);


router.get(
    "/search",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const { q } = req.query;

            if (!q) {
                return res.status(400).json({
                    success: false,
                    message: "Search value required"
                });
            }

            const searchValue = q.trim();

            const suppliers = await Supplier.find({
                superAdminId: hierarchy.superAdminId,
                isActive: true,
                $or: [
                    { supplierName: { $regex: searchValue, $options: "i" } },
                    { mobile: { $regex: searchValue, $options: "i" } },
                    { gstNumber: { $regex: searchValue.toUpperCase(), $options: "i" } },
                    { contactPerson: { $regex: searchValue, $options: "i" } }
                ]
            })
                .select("supplierName mobile gstNumber email address city state pincode contactPerson")
                .limit(10)
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                count: suppliers.length,
                data: suppliers
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
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

            const supplier = await Supplier.findOne({
                _id: req.params.id,
                superAdminId: hierarchy.superAdminId
            });

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            res.json({
                success: true,
                data: supplier
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });
        }
    }
);

router.put(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const supplier = await Supplier.findOneAndUpdate(
                {
                    _id: req.params.id,
                    superAdminId: hierarchy.superAdminId
                },
                req.body,
                { new: true, runValidators: true }
            );

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            res.json({
                success: true,
                message: "Supplier updated successfully",
                data: supplier
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });
        }
    }
);


router.delete(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const supplier = await Supplier.findOneAndUpdate(
                {
                    _id: req.params.id,
                    superAdminId: hierarchy.superAdminId
                },
                { isActive: false },
                { new: true }
            );

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            res.json({
                success: true,
                message: "Supplier deleted successfully"
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });
        }
    }
);

module.exports = router;