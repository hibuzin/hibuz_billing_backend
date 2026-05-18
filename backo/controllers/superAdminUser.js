const bcrypt = require("bcryptjs");
const User = require("../models/superAdminUser");

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
                message: "Super Admin can create only admin or cashier"
            });
        }

        const superAdminId = req.user.userId;

        const existingUser = await User.findOne({
            email,
            superAdminId
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists in your company"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            createdBy: superAdminId,
            superAdminId,
            adminId: null
        });

        return res.status(201).json({
            success: true,
            message: `${role} created successfully`,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                superAdminId: user.superAdminId,
                createdBy: user.createdBy,
                isActive: user.isActive,
                createdAt: user.createdAt
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