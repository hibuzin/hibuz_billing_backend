const User = require("../models/user");


const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { blacklistToken } = require("../middleware/auth");
const adminandcashier = require("../models/admin_and_cashier");
const mongoose = require("mongoose");




exports.setupStatus = async (req, res) => {
    try {
        const superAdmin = await User.findOne({
            role: "super_admin"
        });

        if (!superAdmin) {
            return res.status(200).json({
                success: true,
                isRegistered: false,
                message: "Super Admin not registered"
            });
        }

        return res.status(200).json({
            success: true,
            isRegistered: true,
            message: "Super Admin already registered"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};



exports.registerSuperAdmin = async (req, res) => {
    try {
        const {
            CompanyName,
            CompanyPhone,
            CompanyEmail,
            password,
            address,
            state,
            pincode,
            city,
            gstnumber
        } = req.body;

        if (!CompanyName || !CompanyPhone || !CompanyEmail || !password) {
            return res.status(400).json({
                success: false,
                message: "Company name, phone, email and password are required"
            });
        }

        const cleanEmail = CompanyEmail.trim().toLowerCase();
        const cleanPhone = CompanyPhone.trim();

        const existingUser = await User.findOne({
            $or: [
                { CompanyEmail: cleanEmail },
                { CompanyPhone: cleanPhone }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Shop already registered with this email or phone"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            CompanyName: CompanyName.trim(),
            CompanyPhone: cleanPhone,
            CompanyEmail: cleanEmail,
            password: hashedPassword,
            address: address?.trim() || "",
            state: state?.trim() || "",
            pincode: pincode?.trim() || "",
            city: city?.trim() || "",
            gstnumber: gstnumber?.trim().toUpperCase() || "",
            role: "super_admin",

            subscription: {
                status: "inactive",
                plan: null,
                startDate: null,
                endDate: null
            }
        });

        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role,
                superAdminId: user._id,
                adminId: null
            },
            process.env.JWT_SECRET
        );

        return res.status(201).json({
            success: true,
            message: "Shop super admin created successfully",
            token,
            user: {
                userId: user._id,
                CompanyName: user.CompanyName,
                CompanyPhone: user.CompanyPhone,
                CompanyEmail: user.CompanyEmail,
                address: user.address,
                state: user.state,
                pincode: user.pincode,
                city: user.city,
                gstnumber: user.gstnumber,
                role: user.role,
                superAdminId: user._id,
                subscription: user.subscription
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.login = async (req, res) => {
    try {
        const { email, CompanyEmail, phone, password } = req.body;

        const loginValue = (email || CompanyEmail || phone)?.trim().toLowerCase();

        if (!loginValue || !password) {
            return res.status(400).json({
                success: false,
                message: "Email/phone and password are required"
            });
        }

        let user = await User.findOne({
            $or: [
                { CompanyEmail: loginValue },
                { CompanyPhone: loginValue }
            ]
        }).select("+password");



        if (!user) {
            user = await adminandcashier.findOne({
                $or: [
                    { email: loginValue },
                    { phone: loginValue }
                ]
            }).select("+password");
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        let superAdminId = null;
        let adminId = null;

        if (user.role === "super_admin") {
            superAdminId = user._id;
        }

        if (user.role === "admin") {
            superAdminId = user.superAdminId;
            adminId = user._id;
        }

        if (user.role === "cashier") {
            superAdminId = user.superAdminId;
            adminId = user.adminId || null;
        }

        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role,
                superAdminId,
                adminId
            },
            process.env.JWT_SECRET
        );

        user.lastLogin = new Date();
        await user.save();

        const userData =
            user.role === "super_admin"
                ? {
                    userId: user._id,
                    role: user.role,
                    CompanyName: user.CompanyName,
                    CompanyPhone: user.CompanyPhone,
                    CompanyEmail: user.CompanyEmail,
                    superAdminId,

                    subscription: {
                        status: user.subscription.status,
                        plan: user.subscription.plan,
                        startDate: user.subscription.startDate
                            ? user.subscription.startDate.toISOString().split("T")[0]
                            : null,
                        endDate: user.subscription.endDate
                            ? user.subscription.endDate.toISOString().split("T")[0]
                            : null
                    }

                }
                : {
                    userId: user._id,
                    role: user.role,
                    name: user.name,
                    email: user.email || "",
                    phone: user.phone,
                    superAdminId,
                    adminId
                };

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: userData
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters"
            });
        }

        let account;

        if (req.user.role === "super_admin") {
            account = await User.findById(req.user.userId).select("+password");
        } else {
            account = await adminandcashier.findById(req.user.userId).select("+password");
        }

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, account.password);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        account.password = await bcrypt.hash(newPassword, 10);
        await account.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.changeUserPasswordBySuperAdmin = async (req, res) => {
    try {

        const { userId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({
                success: false,
                message: "New password is required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const user = await User.findOne({
            _id: userId,
            role: { $in: ["admin", "cashier"] }
        }).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);

        await user.save();

        return res.status(200).json({
            success: true,
            message: `${user.role} password changed successfully`
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};


exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");

        user.resetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.resetTokenExpire = Date.now() + 15 * 60 * 1000;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Reset token generated",
            resetToken
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Token and new password are required"
            });
        }

        const hashedToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            resetToken: hashedToken,
            resetTokenExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired token"
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetToken = undefined;
        user.resetTokenExpire = undefined;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successful"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.logout = async (req, res) => {
    try {
        const token = req.token;

        blacklistToken(token);

        return res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};