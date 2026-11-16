const mongoose = require("mongoose");

const stockBatchSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
            index: true
        },

        barcode: {
            type: String,
            required: true,
            index: true
        },

        purchaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Purchase",
            required: true
        },

        purchaseItemId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },

        batchNo: {
            type: String,
            default: ""
        },

        costPrice: {
            type: Number,
            required: true
        },

        sellingPrice: {
            type: Number,
            required: true
        },

        mrp: {
            type: Number,
            required: true
        },

        receivedQty: {
            type: Number,
            required: true
        },

        availableQty: {
            type: Number,
            required: true
        },

        soldQty: {
            type: Number,
            default: 0
        },

        packedDate: {
            type: Date,
            default: null
        },

        expiryDate: {
            type: Date,
            default: null
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("StockBatch", stockBatchSchema);