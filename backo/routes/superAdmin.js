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
            const userId = req.user.userId || req.user.id;

            const superAdmin = await User.findOne({
                _id: userId,
                role: "super_admin"
            }).select(
                "-password -adminId -superAdminId"
            );

            if (!superAdmin) {
                return res.status(404).json({
                    success: false,
                    message: "Super Admin not found"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Super Admin profile fetched successfully",
                data: superAdmin
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



router.put(
    "/super-admin/me",
    verifyToken,
    authorize("super_admin"),
    async (req, res) => {
        try {
            const {
                CompanyName,
                CompanyPhone,
                CompanyEmail,
                address,
                state,
                pincode,
                gstnumber,
                city
            } = req.body;

            const user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Super Admin not found"
                });
            }

            if (CompanyEmail && CompanyEmail !== user.CompanyEmail) {
                const existingEmail = await User.findOne({
                    CompanyEmail,
                    _id: { $ne: user._id }
                });

                if (existingEmail) {
                    return res.status(400).json({
                        success: false,
                        message: "Company email already registered"
                    });
                }
            }

            user.CompanyName = CompanyName || user.CompanyName;
            user.CompanyPhone = CompanyPhone || user.CompanyPhone;
            user.CompanyEmail = CompanyEmail || user.CompanyEmail;
            user.address = address || user.address;
            user.state = state || user.state;
            user.pincode = pincode || user.pincode;
            user.gstnumber = gstnumber || user.gstnumber;
            user.city = city || user.city;

            await user.save();

            const updatedUser = await User.findById(user._id).select("-password");

            res.status(200).json({
                success: true,
                message: "Super Admin updated successfully",
                data: updatedUser
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
    "/super-admin/delete",
    verifyToken,
    authorize("super_admin"),
    async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;

            const superAdmin = await User.findOne({
                _id: userId,
                role: "super_admin"
            });

            if (!superAdmin) {
                return res.status(404).json({
                    success: false,
                    message: "Super Admin not found"
                });
            }

            await User.findByIdAndDelete(userId);

            return res.status(200).json({
                success: true,
                message: "Super Admin deleted successfully"
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