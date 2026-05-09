const express = require("express");
const router = express.Router();

const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


router.get(
    "/admin/me",
    verifyToken,
    authorize("admin"),
    async (req, res) => {
        try {
            const user = await User.findOne({
                _id: req.user.userId,
                role: "admin"
            }).select("-password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Admin not found"
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




router.get("/", verifyToken, authorize("super_admin"), async (req, res) => {
    try {
        const { userId } = req.user;

        const filter = {
            role: "admin",
            createdBy: userId
        };

        const admins = await User.find(filter).select("-password");

        res.json({
            success: true,
            count: admins.length,
            data: admins
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});



router.put(
    "/admin/me",
    verifyToken,
    authorize("admin"),
    async (req, res) => {
        try {
            const { name, email } = req.body;

            const admin = await User.findOne({
                _id: req.user.userId,
                role: "admin"
            });

            if (!admin) {
                return res.status(404).json({
                    success: false,
                    message: "Admin not found"
                });
            }

            if (name) admin.name = name;
            if (email) admin.email = email;

            await admin.save();

            res.json({
                success: true,
                message: "Profile updated successfully",
                data: {
                    id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    role: admin.role
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




router.get("/:id", verifyToken, authorize("super_admin"), async (req, res) => {
    try {
        const admin = await User.findOne({
            _id: req.params.id,
            role: "admin",
            createdBy: req.user.userId
        }).select("-password");

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        res.json({
            success: true,
            data: admin
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




router.put("/:id", verifyToken, authorize("super_admin"), async (req, res) => {
    try {
        const { name, email } = req.body;

        const admin = await User.findOne({
            _id: req.params.id,
            role: "admin",
            createdBy: req.user.userId
        });

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        admin.name = name || admin.name;
        admin.email = email || admin.email;

        await admin.save();

        res.json({
            success: true,
            message: "Admin updated successfully",
            data: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
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



router.delete("/:id", verifyToken, authorize("super_admin"), async (req, res) => {
    try {
        const admin = await User.findOneAndDelete({
            _id: req.params.id,
            role: "admin",
            createdBy: req.user.userId
        });

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        res.json({
            success: true,
            message: "Admin deleted successfully"
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