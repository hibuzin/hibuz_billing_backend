const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
    {
        cashier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        closedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        settledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        openingAmount: {
            type: Number,
            required: true,
            default: 0
        },

        closingAmount: {
            type: Number,
            default: 0
        },

        totalSales: {
            type: Number,
            default: 0
        },

        totalBills: {
            type: Number,
            default: 0
        },

        startTime: {
            type: Date,
            default: Date.now
        },

        endTime: {
            type: Date
        },

        cashSales: {
            type: Number,
            default: 0
        },

        upiSales: {
            type: Number,
            default: 0
        },

        cardSales: {
            type: Number,
            default: 0
        },

        dueSales: {
            type: Number,
            default: 0
        },

        expectedCash: {
            type: Number,
            default: 0
        },

        cashRefund: {
            type: Number,
            default: 0
        },

        upiRefund: {
            type: Number,
            default: 0
        },

        cardRefund: {
            type: Number,
            default: 0
        },

        cashIn: {
            type: Number,
            default: 0
        },

        cashOut: {
            type: Number,
            default: 0
        },

        cashCounted: {
            type: Number,
            default: 0
        },

        difference: {
            type: Number,
            default: 0
        },

        settlementStatus: {
            type: String,
            enum: ["not_settled", "matched", "short", "excess"],
            default: "not_settled"
        },

        settledAt: {
            type: Date
        },

        status: {
            type: String,
            enum: ["open", "settled", "closed"],
            default: "open"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Session", sessionSchema);