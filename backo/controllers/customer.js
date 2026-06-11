const mongoose = require("mongoose");
const Customer = require("../models/customer");
const user = require("../models/user");
const Counter = require("../models/counter");
const Bill = require("../models/bill");
const { attachHierarchy } = require("../utils/hierarchy");
const DuePayment = require("../models/due_payment");

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

exports.createCustomer = async (req, res) => {
    try {
        const { name, phone, email, address, gstNumber } = req.body;
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
            finalAdminId = null;
        } else if (role === "admin") {
            finalSuperAdminId = superAdminId;
            finalAdminId = userId;
        } else if (role === "cashier") {
            finalSuperAdminId = superAdminId;
            finalAdminId = adminId || null;
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

            gstNumber: gstNumber
                ? gstNumber.trim().toUpperCase()
                : "",

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




exports.getCustomerBalanceTotals = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const result = await DuePayment.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    pendingAmount: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: "$customerId",
                    totalAmount: { $sum: "$totalAmount" },
                    paidAmount: { $sum: "$paidAmount" },
                    balanceAmount: { $sum: "$pendingAmount" },
                    totalBills: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "customers",
                    localField: "_id",
                    foreignField: "_id",
                    as: "customer"
                }
            },
            {
                $unwind: "$customer"
            },
            {
                $project: {
                    _id: 0,
                    customerId: "$customer.customerId",
                    name: "$customer.name",
                    mobile: "$customer.phone",

                    balanceAmount: {
                        $round: ["$balanceAmount", 2]
                    },
                    totalAmount: {
                        $round: ["$totalAmount", 2]
                    },
                    paidAmount: {
                        $round: ["$paidAmount", 2]
                    },
                    totalBills: 1
                }
            },
            {
                $sort: {
                    balanceAmount: -1
                }
            }
        ]);

        const totalBalance = result.reduce(
            (sum, item) => sum + Number(item.balanceAmount || 0),
            0
        );

        res.json({
            success: true,
            totalCustomers: result.length,
            totalCustomerBalance: Number(totalBalance.toFixed(2)),
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.getCustomerBalanceDetails = async (req, res) => {
    try {
        const { customerId } = req.params;

        const hierarchy = attachHierarchy(req.user);

        const customer = await Customer.findOne({
            customerId: Number(customerId),
            superAdminId: hierarchy.superAdminId
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const dues = await DuePayment.find({
            customerId: customer._id,
            pendingAmount: { $gt: 0 },
            superAdminId: hierarchy.superAdminId
        })
            .sort({ createdAt: -1 });

        const totalBalance = dues.reduce(
            (sum, d) => sum + Number(d.pendingAmount || 0),
            0
        );

        res.json({
            success: true,
            customer: {
                customerId: customer.customerId,
                name: customer.name,
                mobile: customer.phone
            },
            totalBills: dues.length,
            totalBalance: Number(totalBalance.toFixed(2)),
            data: dues.map(d => ({
                duePaymentId: d._id,
                billNo: d.billNo,
                billDate: d.billDate,
                totalAmount: d.totalAmount,
                paidAmount: d.paidAmount,
                balanceAmount: d.pendingAmount
            }))
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.getCustomers = async (req, res) => {
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

exports.customersSearch = async (req, res) => {
    try {
        const { q } = req.query;
        const { userId, role, superAdminId } = req.user;

        if (!q || q.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Search value is required"
            });
        }

        const search = q.trim();

        let finalSuperAdminId;

        if (role === "super_admin") {
            finalSuperAdminId = userId;
        } else {
            finalSuperAdminId = superAdminId;
        }

        if (!finalSuperAdminId) {
            return res.status(403).json({
                success: false,
                message: "Invalid hierarchy"
            });
        }

        const filter = {
            superAdminId: finalSuperAdminId,
            $or: [
                { phone: { $regex: search, $options: "i" } },
                { name: { $regex: search, $options: "i" } }
            ]
        };


        if (!isNaN(search)) {
            filter.$or.push({
                customerId: Number(search)
            });
        }

        const customers = await Customer.find(filter)
            .select("customerId name phone email address")
            .limit(10)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Customers fetched successfully",
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


exports.getCustomerById = async (req, res) => {
    try {

        const { id } = req.params;

        const hierarchy = attachHierarchy(req.user);

        let filter = {
            superAdminId: hierarchy.superAdminId
        };


        if (mongoose.Types.ObjectId.isValid(id)) {
            filter._id = id;
        } else {
            filter.customerId = Number(id);
        }

        const customer = await Customer.findOne(filter);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
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

exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address } = req.body;

        const hierarchy = attachHierarchy(req.user);

        let filter = {
            superAdminId: hierarchy.superAdminId
        };

        if (mongoose.Types.ObjectId.isValid(id)) {
            filter._id = id;
        } else {
            filter.id = Number(id);
        }

        const customer = await Customer.findOne(filter);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        if (name) customer.name = name.trim();
        if (phone) customer.phone = phone.trim();
        if (email) customer.email = email.toLowerCase();
        if (address !== undefined) customer.address = address;

        customer.lastUpdatedBy = req.user.userId;

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

exports.deleteCustomer = async (req, res) => {
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

exports.customersExport = async (req, res) => {
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

exports.customersImport = async (req, res) => {
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