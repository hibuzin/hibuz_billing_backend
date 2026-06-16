const mongoose = require("mongoose");

const productPriceHistorySchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        barcode: {
            type: String,
            default: ""
        },

        oldMrp: {
            type: Number,
            default: 0
        },
        newMrp: {
            type: Number,
            default: 0
        },

        oldCostPrice: {
            type: Number,
            default: 0
        },
        newCostPrice: {
            type: Number,
            default: 0
        },

        oldSellingPrice: {
            type: Number,
            default: 0
        },
        newSellingPrice: {
            type: Number,
            default: 0
        },

        source: {
            type: String,
            enum: ["product_create", "purchase"],
            default: "purchase"
        },

        purchaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Purchase",
            default: null
        },

        invoiceNo: {
            type: String,
            default: ""
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "ProductPriceHistory",
    productPriceHistorySchema
);