const mongoose = require("mongoose");
const Session = require("../models/session");
const Bill = require("../models/bill");
const { attachHierarchy } = require("../utils/hierarchy");

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


exports.settleSession = async (req, res) => {
    try {
        const { cashCounted } = req.body;

        const hierarchy = attachHierarchy(req.user);
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

        const bills = await Bill.find({
            cashier: userId,
            superAdminId: hierarchy.superAdminId,
            createdAt: {
                $gte: session.startTime,
                $lte: new Date()
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

            for (const pay of bill.payments || []) {
                const amount = Number(pay.amount || 0);

                if (pay.method === "cash") cashSales += amount;
                if (pay.method === "upi") upiSales += amount;
                if (pay.method === "card") cardSales += amount;
            }

            if (bill.paymentStatus === "due" || bill.paymentStatus === "partial") {
                const paidAmount = (bill.payments || []).reduce(
                    (sum, p) => sum + Number(p.amount || 0),
                    0
                );

                dueSales += grandTotal - paidAmount;
            }
        }

        const counted = Number(cashCounted || 0);

        const expectedCash =
            Number(session.openingAmount || 0) +
            cashSales +
            Number(session.cashIn || 0) -
            Number(session.cashRefund || 0) -
            Number(session.cashOut || 0);

        const difference = counted - expectedCash;

        let settlementStatus = "matched";
        if (difference < 0) settlementStatus = "short";
        if (difference > 0) settlementStatus = "excess";

        session.totalSales = Number(totalSales.toFixed(2));
        session.totalBills = bills.length;
        session.cashSales = Number(cashSales.toFixed(2));
        session.upiSales = Number(upiSales.toFixed(2));
        session.cardSales = Number(cardSales.toFixed(2));
        session.dueSales = Number(dueSales.toFixed(2));

        session.cashCounted = Number(counted.toFixed(2));
        session.expectedCash = Number(expectedCash.toFixed(2));
        session.difference = Number(difference.toFixed(2));
        session.settlementStatus = settlementStatus;
        session.settledAt = new Date();
        session.status = "settled";

        await session.save();

        return res.status(200).json({
            success: true,
            message: "Session settled successfully",
            session
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getCurrentSession = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const userId = req.user.userId || req.user.id;

        const session = await Session.findOne({
            cashier: userId,
            superAdminId: hierarchy.superAdminId,
            status: { $in: ["open", "settled"] }
        }).sort({ createdAt: -1 });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "No active session found"
            });
        }

        const bills = await Bill.find({
            cashier: userId,
            superAdminId: hierarchy.superAdminId,
            createdAt: {
                $gte: session.startTime,
                $lte: new Date()
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

            for (const pay of bill.payments || []) {
                const amount = Number(pay.amount || 0);
                const method = String(pay.method || "").toLowerCase();

                if (method === "cash") cashSales += amount;
                if (method === "upi") upiSales += amount;
                if (method === "card") cardSales += amount;
            }

            if (bill.paymentStatus === "due" || bill.paymentStatus === "partial") {
                const paidAmount = (bill.payments || []).reduce(
                    (sum, p) => sum + Number(p.amount || 0),
                    0
                );

                dueSales += grandTotal - paidAmount;
            }
        }

        const expectedCash =
            Number(session.openingAmount || 0) +
            cashSales +
            Number(session.cashIn || 0) -
            Number(session.cashRefund || 0) -
            Number(session.cashOut || 0);

        session.totalSales = Number(totalSales.toFixed(2));
        session.totalBills = bills.length;
        session.cashSales = Number(cashSales.toFixed(2));
        session.upiSales = Number(upiSales.toFixed(2));
        session.cardSales = Number(cardSales.toFixed(2));
        session.dueSales = Number(dueSales.toFixed(2));
        session.expectedCash = Number(expectedCash.toFixed(2));

        await session.save();

        return res.status(200).json({
            success: true,
            session
        });

    } catch (error) {
        return res.status(500).json({
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
            status: "settled"
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Please settle session before closing"
            });
        }

        session.closingAmount = Number(closingAmount || session.cashCounted || 0);
        session.endTime = new Date();
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