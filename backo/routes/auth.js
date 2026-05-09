const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { verifyToken, blacklistToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const crypto = require("crypto");

router.post("/register-super-admin", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }


        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            password: hashed,
            role: "super_admin"
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: "Super Admin created successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});


router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        let superAdminId = null;
        let adminId = null;

        if (user.role === "super_admin") {
            superAdminId = user._id;

        }

        else if (user.role === "admin") {
            superAdminId = user.createdBy;
            adminId = user._id;
        }

        else if (user.role === "cashier") {

            adminId = user.createdBy;


            const admin = await User.findById(adminId);


            superAdminId = admin?.createdBy || null;
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

        res.json({
            success: true,
            token,
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                adminId,
                superAdminId
            }
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.post("/create-user", verifyToken, authorize("super_admin"), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!["admin", "cashier"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Super Admin can only create admin or cashier"
            });
        }

        const superAdminId = req.user.userId;

       
        const existing = await User.findOne({
            email,
            superAdminId
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "User already exists in your company"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            password: hashedPassword,
            role,
            createdBy: superAdminId,
            superAdminId   
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: `${role} created successfully`,
            data: user
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

router.post(
    "/create-cashier",
    verifyToken,
    authorize("admin"),
    async (req, res) => {
        try {
            const { name, email, password } = req.body;

            const { userId, superAdminId } = req.user;

           
            const existing = await User.findOne({
                email,
                superAdminId: superAdminId
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: "User already exists under this organization"
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const user = await User.create({
                name,
                email,
                password: hashedPassword,
                role: "cashier",

                createdBy: userId,       
                superAdminId: superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Cashier created successfully",
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




router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

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

        
        res.json({
            success: true,
            message: "Reset token generated",
            resetToken
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});


router.post("/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

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

        res.json({
            success: true,
            message: "Password reset successful"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});


router.post("/logout", verifyToken, (req, res) => {
    blacklistToken(req.token);
    res.json({ message: "Logged out successfully" });
});

module.exports = router;