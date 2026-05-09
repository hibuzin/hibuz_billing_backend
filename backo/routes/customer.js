const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const user = require("../models/user");
const Counter = require("../models/Counter");
const { attachHierarchy } = require("../utils/hierarchy");

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const upload = multer({ dest: "uploads/" });



const getNextCustomerId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { name: "customer" },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};



router.post(
    "/customers",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { name, phone, email, address } = req.body;
            const { userId, role, superAdminId, adminId } = req.user;

            if (!name || !phone) {
                return res.status(400).json({
                    success: false,
                    message: "Name and phone are required"
                });
            }

            let finalSuperAdminId = null;
            let finalAdminId = null;

            if (role === "super_admin") {
                finalSuperAdminId = userId;

            }

            if (!finalSuperAdminId) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid hierarchy"
                });
            }

            const cleanPhone = phone.trim();

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
                roleCreatedBy: role,
                superAdminId: finalSuperAdminId,
                adminId: finalAdminId
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



router.get(
    "/customers",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { page = 1, limit = 10, search = "" } = req.query;
            const { role, superAdminId } = req.user;

            let filter = {
                superAdminId: role === "super_admin" ? superAdminId : superAdminId
            };


            if (search) {
                filter.name = { $regex: search, $options: "i" };
            }

            const customers = await Customer.find(filter)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .sort({ createdAt: -1 });

            const total = await Customer.countDocuments(filter);

            res.json({
                success: true,
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
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

router.get(
    "/customers/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { superAdminId } = req.user;

            let filter = {};

            
            if (mongoose.Types.ObjectId.isValid(id)) {
                filter._id = id;
            } else {
                filter.customerId = id;
            }

           
            if (role === "super_admin") {
                filter.superAdminId = userId;
            } else {
                filter.superAdminId = superAdminId;
            }

            const customer = await Customer.findOne({
                _id: id,
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


router.put(
    "/customers/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { userId, superAdminId } = req.user;
            const { id } = req.params;
            const { name, phone, email, address } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid customer ID"
                });
            }

          
            const customer = await Customer.findOne({
                _id: id,
                superAdminId: superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or not authorized"
                });
            }

            
            if (name) customer.name = name.trim();
            if (phone) customer.phone = phone.trim();
            if (email) customer.email = email.toLowerCase();
            if (address !== undefined) customer.address = address;

            customer.lastUpdatedBy = userId;

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


router.delete(
    "/customers/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { superAdminId } = req.user;
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid customer ID"
                });
            }

            const deleted = await Customer.findOneAndDelete({
                _id: id,
                superAdminId: superAdminId
            });

            if (!deleted) {
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


router.get(
    "/customers/export",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const { userId, role, superAdminId } = req.user;

            const finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

            const customers = await Customer.find({
                superAdminId: finalSuperAdminId
            }).lean();

           
            let csv = "Name,Phone,Email,Address,Points,TotalSpent\n";


            customers.forEach(c => {
                csv += `${c.name || ""},${c.phone || ""},${c.email || ""},${c.address || ""},${c.loyaltyPoints || 0},${c.totalSpent || 0}\n`;
            });

            res.header("Content-Type", "text/csv");
            res.attachment("customers.csv");

            return res.send(csv);

        } catch (err) {
            res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);





router.post(
    "/customers/import",
    verifyToken,
    authorize("super_admin", "admin"),
    upload.single("file"),
    async (req, res) => {
        try {
            const { userId, role, superAdminId } = req.user;

            const finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

            const results = [];

            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on("data", (data) => results.push(data))
                .on("end", async () => {

                    const bulk = results.map(item => ({
                        insertOne: {
                            document: {
                                name: item.Name,
                                phone: item.Phone,
                                email: item.Email,
                                address: item.Address,
                                loyaltyPoints: Number(item.Points) || 0,
                                totalSpent: Number(item.TotalSpent) || 0,
                                superAdminId: finalSuperAdminId,
                                createdBy: userId
                            }
                        }
                    }));

                    if (bulk.length > 0) {
                        await Customer.bulkWrite(bulk);
                    }

                    
                    fs.unlinkSync(req.file.path);

                    res.json({
                        success: true,
                        message: `${bulk.length} customers imported`
                    });
                });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: err.message
            });
        }
    }
);




module.exports = router;