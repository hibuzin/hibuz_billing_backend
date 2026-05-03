const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const user = require("../models/user");
const Counter = require("../models/Counter");



const getNextCustomerId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "customer" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};



router.post("/customers",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { name, phone, email, address } = req.body;
            const { userId, superAdminId, role } = req.user;

           
            if (!name || !phone) {
                return res.status(400).json({
                    success: false,
                    message: "Name and phone are required"
                });
            }

            const cleanPhone = phone.trim();

            
            const finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

           
            const existing = await Customer.findOne({
                phone: cleanPhone,
                superAdminId: finalSuperAdminId
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: "Customer already exists"
                });
            }

            const customerId = await getNextCustomerId();

            const customer = await Customer.create({
                customerId,
                name: name.trim(),
                phone: cleanPhone,
                email,
                address,
                createdBy: userId,
                superAdminId: finalSuperAdminId
            });

            res.status(201).json({
                success: true,
                message: "Customer created successfully",
                data: customer
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



router.get("/",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const customers = await Customer.find({
                superAdminId: superAdminId  
            }).sort({ createdAt: -1 });

            res.json({
                success: true,
                count: customers.length,
                data: customers
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


router.get("/:customerId",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;
            const id = Number(req.params.customerId);

            const customer = await Customer.findOne({
                customerId: id,
                superAdminId: superAdminId   
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            const cleanCustomer = {
                id: customer._id,
                customerId: customer.customerId,
                name: customer.name,
                phone: customer.phone,
                ...(customer.email && { email: customer.email }),
                ...(customer.address && { address: customer.address }),
                loyaltyPoints: customer.loyaltyPoints,
                totalSpent: customer.totalSpent
            };

            res.json({
                success: true,
                message: "Customer fetched successfully",
                data: cleanCustomer
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


router.put("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const customer = await Customer.findOne({
                _id: req.params.id,
                superAdminId: superAdminId  
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

           
            const allowedFields = ["name", "phone", "email", "address"];

            allowedFields.forEach((field) => {
                if (req.body[field] !== undefined) {
                    customer[field] = req.body[field];
                }
            });

            await customer.save();

            res.json({
                success: true,
                message: "Customer updated successfully",
                data: customer
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


router.delete("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;
            const id = Number(req.params.id);

            const customer = await Customer.findOneAndDelete({
                customerId: id,
                superAdminId: superAdminId   
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            res.json({
                success: true,
                message: "Customer deleted successfully"
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



router.post("/loyalty/add",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { customerId, amount } = req.body;
            const { userId, superAdminId } = req.user;

            const amountNum = Number(amount);

            if (!amountNum || amountNum <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid amount"
                });
            }

            
            const customer = await Customer.findOne({
                customerId,
                superAdminId: superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            const points = Math.floor(amountNum / 100);

            customer.loyaltyPoints += points;
            customer.totalSpent += amountNum;

            
            customer.lastUpdatedBy = userId;

            await customer.save();

            res.json({
                success: true,
                message: "Loyalty points added",
                addedPoints: points,
                totalPoints: customer.loyaltyPoints
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



router.post("/loyalty/redeem",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { customerId, points } = req.body;
            const { userId, superAdminId } = req.user;

            const pointsNum = Number(points);

            if (!pointsNum || pointsNum <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid points"
                });
            }

           
            const customer = await Customer.findOne({
                customerId,
                superAdminId: superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            if (customer.loyaltyPoints < pointsNum) {
                return res.status(400).json({
                    success: false,
                    message: "Not enough loyalty points"
                });
            }

            customer.loyaltyPoints -= pointsNum;

           
            customer.lastUpdatedBy = userId;

            await customer.save();

            res.json({
                success: true,
                message: "Points redeemed successfully",
                discount: pointsNum,
                remainingPoints: customer.loyaltyPoints
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


router.get("/loyalty/:customerId",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const customer = await Customer.findOne({
                customerId: req.params.customerId,
                superAdminId: superAdminId  
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            res.json({
                success: true,
                customerId: customer.customerId,
                name: customer.name,
                loyaltyPoints: customer.loyaltyPoints,
                totalSpent: customer.totalSpent
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