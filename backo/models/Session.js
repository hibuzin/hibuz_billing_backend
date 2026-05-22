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

        status: {
            type: String,
            enum: ["open", "closed"],
            default: "open"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Session", sessionSchema);