const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const User = require("../models/user");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const bcrypt = require("bcryptjs");



router.get("/", verifyToken, authorize("super_admin", "admin"), async (req, res) => {
    try {
        const { userId } = req.user;

        const cashiers = await User.find({
            role: "cashier",
            createdBy: userId
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



router.get("/:id", verifyToken, authorize("super_admin", "admin"), async (req, res) => {
    try {
        const { userId } = req.user;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID"
            });
        }

        const cashier = await User.findOne({
            _id: id,
            role: "cashier",
            createdBy: userId
        }).select("-password");

        if (!cashier) {
            return res.status(404).json({
                success: false,
                message: "Cashier not found or not authorized"
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


router.put("/:id",verifyToken,authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;
            const { name, email } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

            const cashier = await User.findOneAndUpdate(
                {
                    _id: id,
                    role: "cashier",
                    createdBy: userId
                },
                {
                    $set: {
                        name,
                        email
                    }
                },
                { new: true }
            ).select("-password");

            if (!cashier) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found or not authorized"
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



router.delete("/:id",verifyToken,authorize("super_admin", "admin"),async (req, res) => {
        try {
            const { userId } = req.user;
            const { id } = req.params;

           
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

           
            const deleted = await User.findOneAndDelete({
                _id: id,
                role: "cashier",
                createdBy: userId
            });

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: "Cashier not found or not authorized"
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