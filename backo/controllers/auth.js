const User = require("../models/user");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { blacklistToken } = require("../middleware/auth");
const Staff = require("../models/adminandcashier");
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
            gstnumber,
            city
        } = req.body;

        if (
            !CompanyName ||
            !CompanyPhone ||
            !CompanyEmail ||
            !password ||
            !address ||
            !state ||
            !pincode ||
            !gstnumber ||
            !city
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const alreadySuperAdmin = await User.findOne({
            role: "super_admin"
        });

        if (alreadySuperAdmin) {
            return res.status(400).json({
                success: false,
                message: "Super Admin already exists"
            });
        }

        const existingUser = await User.findOne({
            CompanyEmail
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Company email already registered"
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        const user = new User({
            CompanyName,
            CompanyPhone,
            CompanyEmail,
            password: hashed,
            address,
            state,
            pincode,
            gstnumber,
            city,
            role: "super_admin"
        });

        await user.save();

        return res.status(201).json({
            success: true,
            message: "Super Admin created successfully",
            data: {
                id: user._id,
                CompanyName: user.CompanyName,
                CompanyPhone: user.CompanyPhone,
                CompanyEmail: user.CompanyEmail,
                address: user.address,
                state: user.state,
                pincode: user.pincode,
                gstnumber: user.gstnumber,
                city: user.city,
                role: user.role
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

exports.createUser = async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;

        if (!name || !email || !phone || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (!["admin", "cashier"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Only admin or cashier allowed"
            });
        }

        const existingStaff = await Staff.findOne({
            email,
            superAdminId: req.user.superAdminId || req.user.userId
        });

        if (existingStaff) {
            return res.status(400).json({
                success: false,
                message: "Email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newStaff = new Staff({
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            superAdminId: req.user.superAdminId || req.user.userId,
            adminId: role === "cashier" && req.user.role === "admin" ? req.user.userId : null,
            createdBy: req.user.userId,
            isActive: true
        });

        await newStaff.save();

        res.status(201).json({
            success: true,
            message: `${role} created successfully`,
            data: {
                _id: newStaff._id,
                name: newStaff.name,
                email: newStaff.email,
                phone: newStaff.phone,
                role: newStaff.role,
                superAdminId: newStaff.superAdminId,
                adminId: newStaff.adminId,
                createdBy: newStaff.createdBy,
                isActive: newStaff.isActive,
                createdAt: newStaff.createdAt
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, CompanyEmail, password } = req.body;

        const loginEmail = email || CompanyEmail; 

        if (!loginEmail || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        let user = await User.findOne({ CompanyEmail: loginEmail }).select("+password");

        if (!user) {
            user = await Staff.findOne({ email: loginEmail }).select("+password");
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        if (!user.password) {
            return res.status(500).json({
                success: false,
                message: "Password not loaded. Check schema select:false and .select('+password')"
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
        } else if (user.role === "admin") {
            superAdminId = user.superAdminId;
            adminId = user._id;
        } else if (user.role === "cashier") {
            superAdminId = user.superAdminId;
            adminId = user.adminId;
        }

        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role,
                adminId,
                superAdminId
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        
        user.lastLogin = new Date();
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                userId: user._id,
                name: user.name || user.CompanyName,
                email: user.email || user.CompanyEmail,
                phone: user.phone || user.CompanyPhone,
                role: user.role,

                CompanyName: user.CompanyName || null,
                CompanyPhone: user.CompanyPhone || null,
                CompanyEmail: user.CompanyEmail || null,
                address: user.address || null,
                state: user.state || null,
                city: user.city || null,
                pincode: user.pincode || null,
                gstnumber: user.gstnumber || null,

                ...(adminId && { adminId }),
                ...(superAdminId && { superAdminId })
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
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
            account = await Staff.findById(req.user.userId).select("+password");
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
        blacklistToken(req.token);

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