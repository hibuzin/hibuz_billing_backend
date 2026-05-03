const express = require("express");
const router = express.Router();

const Supplier = require("../models/Supplier");
const Counter = require("../models/Counter");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");



const getNextSupplierId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "supplier" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};


router.post(
    "/suppliers",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { name, phone, address, email } = req.body;
            const { userId, superAdminId, role } = req.user;

            if (!name || !phone) {
                return res.status(400).json({
                    success: false,
                    message: "Name and phone are required",
                });
            }

            
            const existing = await Supplier.findOne({
                phone,
                superAdminId: superAdminId
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier already exists",
                });
            }

            const supplierId = await getNextSupplierId();

            const supplier = await Supplier.create({
                supplierId,
                name,
                phone,
                email,
                address,

                createdBy: userId,
                role,

                superAdminId: superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Supplier created successfully",
                supplier,
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

module.exports = router;