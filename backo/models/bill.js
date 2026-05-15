const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({


    items: [
        {
            productId: mongoose.Schema.Types.ObjectId,
            barcodeId: mongoose.Schema.Types.ObjectId,
            customerId: Number,
            name: String,
            price: Number,
            gst: Number,
            gstAmount: Number,
            finalPrice: Number,
            redeempoints: Number
        }
    ],

    summary: {
        subTotal: Number,
        totalGST: Number,
        grandTotal: Number
    },

    superAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
    },

    paymentMethod: {
        type: String,
        enum: ["cash", "card", "upi"],
        default: "cash"
    },

    status: {
        type: String,
        enum: ["paid", "pending"],
        default: "paid"
    },

    loyaltyPoints: {
        type: Number,
        default: 0,
    },

    totalSpent: {
        type: Number,
        default: 0,
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
}, { timestamps: true });

module.exports = mongoose.models.Bill || mongoose.model("Bill", billSchema);