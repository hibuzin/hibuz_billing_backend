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

        const userId = req.user.userId || req.user.id;

        const session = await Session.findOne({
            cashier: userId,
            status: "open"
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "No active session found"
            });
        }

        const endTime = new Date();

        const bills = await Bill.find({
            cashier: userId,
            superAdminId: req.user.superAdminId,
            createdAt: {
                $gte: session.startTime,
                $lte: endTime
            }
        });

        let totalSales = 0;
        let cashSales = 0;
        let upiSales = 0;
        let cardSales = 0;
        let dueSales = 0;

        for (const bill of bills) {
            const grandTotal = Number(bill.summary?.grandTotal || 0);
            totalSales += grandTotal;

            if (Array.isArray(bill.payments) && bill.payments.length > 0) {
                for (const pay of bill.payments) {
                    const amount = Number(pay.amount || 0);

                    if (pay.method === "cash") cashSales += amount;
                    if (pay.method === "upi") upiSales += amount;
                    if (pay.method === "card") cardSales += amount;
                }
            }

            if (bill.paymentStatus === "due" || bill.paymentStatus === "partial") {
                const paidAmount = Array.isArray(bill.payments)
                    ? bill.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                    : 0;

                dueSales += grandTotal - paidAmount;
            }
        }

        session.closingAmount = Number(closingAmount || 0);
        session.totalSales = Number(totalSales.toFixed(2));
        session.totalBills = bills.length;

        session.cashSales = Number(cashSales.toFixed(2));
        session.upiSales = Number(upiSales.toFixed(2));
        session.cardSales = Number(cardSales.toFixed(2));
        session.dueSales = Number(dueSales.toFixed(2));

        session.expectedCash = Number(session.openingAmount || 0) + cashSales;

        session.endTime = endTime;
        session.status = "closed";

        await session.save();

        return res.status(200).json({
            success: true,
            message: "Session ended successfully",
            session
        });

    } catch (error) {
        return res.status(500).json({
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