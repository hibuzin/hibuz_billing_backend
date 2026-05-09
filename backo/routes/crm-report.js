const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const user = require("../models/user");
const Counter = require("../models/Counter");
const { attachHierarchy } = require("../utils/hierarchy");



router.get(
    "/customers/report",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 10,
                search = "",
                fromDate,
                toDate
            } = req.query;

            const { userId, role, superAdminId } = req.user;

            const finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

          
            let match = {
                superAdminId: new mongoose.Types.ObjectId(finalSuperAdminId)
            };

            if (search) {
                match.name = { $regex: search, $options: "i" };
            }

            if (fromDate && toDate) {
                match.createdAt = {
                    $gte: new Date(fromDate),
                    $lte: new Date(toDate)
                };
            }

           
            const summary = await Customer.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        totalRevenue: { $sum: "$totalSpent" },
                        totalPoints: { $sum: "$loyaltyPoints" },
                        avgSpend: { $avg: "$totalSpent" }
                    }
                }
            ]);

            
            const topCustomers = await Customer.find(match)
                .sort({ totalSpent: -1 })
                .limit(5)
                .select("name totalSpent loyaltyPoints");

            
            const repeatCustomers = await Customer.countDocuments({
                ...match,
                totalSpent: { $gt: 0 }
            });

            const newCustomers = await Customer.countDocuments({
                ...match,
                totalSpent: 0
            });

            
            const inactiveCustomers = await Customer.countDocuments({
                ...match,
                updatedAt: {
                    $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                }
            });

            
            const customers = await Customer.find(match)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .sort({ createdAt: -1 });

            const total = await Customer.countDocuments(match);

            return res.json({
                success: true,

               
                summary: summary[0] || {
                    totalCustomers: 0,
                    totalRevenue: 0,
                    totalPoints: 0,
                    avgSpend: 0
                },

                insights: {
                    repeatCustomers,
                    newCustomers,
                    inactiveCustomers
                },

                topCustomers,

               
                pagination: {
                    total,
                    page: Number(page),
                    pages: Math.ceil(total / limit)
                },

                data: customers
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);

module.exports = router;