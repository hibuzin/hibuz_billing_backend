const express = require("express");
const router = express.Router();
const User = require("../models/user");
const { verifyToken, blacklistToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


router.get(
    "/super-admin/me",
    verifyToken,
    authorize("super_admin"),
    async (req, res) => {
        try {
            const user = await User.findOne({
                _id: req.user.userId,
                role: "super_admin"
            }).select("-password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Super admin not found"
                });
            }

            res.json({
                success: true,
                data: user
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
    "/super-admin/me",
    verifyToken,
    authorize("super_admin"),
    async (req, res) => {
        try {
            const { name, email } = req.body;

            const user = await User.findOneAndUpdate(
                {
                    _id: req.user.userId,
                    role: "super_admin"
                },
                {
                    $set: {
                        name,
                        email
                    }
                },
                { new: true }
            ).select("-password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Super admin not found"
                });
            }

            res.json({
                success: true,
                message: "Profile updated successfully",
                data: user
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