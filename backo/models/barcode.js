const mongoose = require("mongoose");

const barcodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },

    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    purchaseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Purchase"
    },

    mrp: {
        type: Number,
        default: 0
    },

    sellingPrice: {
        type: Number,
        default: 0
    },

    costPrice: {
        type: Number,
        default: 0
    },

    gstRate: {
        type: Number,
        default: 0
    },

    unit: {
        type: String,
        enum: ["pcs", "kg", "g"],
        default: "pcs"
    },
    unitValue: {
        type: Number,
        default: 1
    },
    qty: {
        type: Number,
        default: 0
    },
    availableQty: {
        type: Number,
        default: 0
    },

    isSold: {
        type: Boolean,
        default: false
    },

    superAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    cashierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true });

module.exports = mongoose.model("Barcode", barcodeSchema);