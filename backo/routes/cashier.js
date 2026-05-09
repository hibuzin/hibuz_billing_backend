const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const User = require("../models/user");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const bcrypt = require("bcryptjs");



router.get(
    "/cashier/me",
    verifyToken,
    authorize("cashier"),
    async (req, res) => {
        try {
            const cashier = await User.findOne({
                _id: req.user.userId,
                role: "cashier"
            }).select("-password");

            if (!cashier) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found"
                });
            }

            res.json({
                success: true,
                data: cashier
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
    "/cashier/me",
    verifyToken,
    authorize("cashier"),
    async (req, res) => {
        try {
            const { name, email } = req.body;

            const cashier = await User.findOne({
                _id: req.user.userId,
                role: "cashier"
            });

            if (!cashier) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found"
                });
            }

            if (name) cashier.name = name;
            if (email) cashier.email = email;

            await cashier.save();

            res.json({
                success: true,
                message: "Profile updated successfully",
                data: {
                    id: cashier._id,
                    name: cashier.name,
                    email: cashier.email,
                    role: cashier.role
                }
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
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {

            const hierarchy = attachHierarchy(req.user);

            
            const cashiers = await User.find({
                role: "cashier",
                superAdminId: hierarchy.superAdminId
            }).select("-password");

            res.json({
                success: true,
                count: cashiers.length,
                data: cashiers
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
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

            const hierarchy = attachHierarchy(req.user);

           
            const cashier = await User.findOne({
                _id: id,
                role: "cashier",
                superAdminId: hierarchy.superAdminId
            }).select("-password");

            if (!cashier) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found"
                });
            }

            res.json({
                success: true,
                data: cashier
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
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {

            const { id } = req.params;
            const { name, email } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            
            const cashier = await User.findOneAndUpdate(
                {
                    _id: id,
                    role: "cashier",
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $set: {
                        name,
                        email
                    }
                },
                {
                    new: true
                }
            ).select("-password");

            if (!cashier) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found"
                });
            }

            res.json({
                success: true,
                message: "Cashier updated successfully",
                data: cashier
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
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {

            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            
            const deleted = await User.findOneAndDelete({
                _id: id,
                role: "cashier",
                superAdminId: hierarchy.superAdminId
            });

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found"
                });
            }

            res.json({
                success: true,
                message: "Cashier deleted successfully",
                data: {
                    userId: deleted._id,
                    email: deleted.email
                }
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