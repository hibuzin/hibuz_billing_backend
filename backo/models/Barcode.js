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

    flavor: {
        type: String,
        default: ""
    },

    liters: {
        type: String,
        default: ""
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