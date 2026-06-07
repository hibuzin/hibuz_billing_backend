const mongoose = require("mongoose");
const Session = require("../models/session");
const Bill = require("../models/bill");

exports.startSession = async (req, res) => {
    try {
        const { openingAmount } = req.body;

        const userId = req.user.userId || req.user.id;

        const alreadyOpen = await Session.findOne({
            cashier: userId,
            status: "open"
        });

        if (alreadyOpen) {
            return res.status(400).json({
                success: false,
                message: "Session already opened"
            });
        }

        const session = await Session.create({
            cashier: userId,
            adminId: req.user.adminId || null,
            superAdminId: req.user.superAdminId || null,
            openingAmount: openingAmount || 0
        });

        res.status(201).json({
            success: true,
            message: "Session started successfully",
            session
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.endSession = async (req, res) => {
    try {
        const { closingAmount } = req.body;

        const session = await Session.findOne({
            cashier: req.user.userId,
            status: "open"
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "No active session found"
            });
        }

        const userId = req.user.userId || req.user.id;

        const bills = await Bill.find({
            cashier: userId,
            createdAt: { $gte: session.startTime }
        });

        const totalSales = bills.reduce((sum, bill) => {
            return sum + (bill.totalAmount || bill.grandTotal || 0);
        }, 0);

        session.closingAmount = closingAmount || 0;
        session.totalSales = totalSales;
        session.totalBills = bills.length;
        session.endTime = new Date();
        session.status = "closed";

        await session.save();

        res.status(200).json({
            success: true,
            message: "Session ended successfully",
            session
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.todaySessions = async (req, res) => {
    try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const query = {
            createdAt: { $gte: start }
        };

        if (req.user.role === "cashier") {
            query.cashier = req.user.userId;
        }

        const sessions = await Session.find(query)
            .sort({ createdAt: -1 })
            .populate("cashier", "CompanyName CompanyEmail role");

        res.status(200).json({
            success: true,
            count: sessions.length,
            sessions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.sessionReport = async (req, res) => {
    try {
        const sessions = await Session.find()
            .sort({ createdAt: -1 })
            .populate("cashier", "CompanyName CompanyEmail role");

        res.status(200).json({
            success: true,
            count: sessions.length,
            sessions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};