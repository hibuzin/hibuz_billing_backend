// models/sales_return.js

const mongoose = require("mongoose");

const SalesReturnSchema = new mongoose.Schema({
    returnNo: String,

    billId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bill"
    },

    invoiceNo: String,

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer"
    },

    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product"
            },
            barcodeId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Barcode"
            },
            barcode: String,

            productName: String,

            soldQty: Number,
            returnQty: Number,

            sellingPrice: Number,
            gstRate: Number,
            gstAmount: Number,

            returnAmount: Number
        }
    ],

    totalReturnAmount: Number,

    refundMethod: {
        type: String,
        enum: ["cash", "upi", "card", "adjust"]
    },

    reason: String,

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    superAdminId: mongoose.Schema.Types.ObjectId,
    adminId: mongoose.Schema.Types.ObjectId

}, {
    timestamps: true
});

module.exports = mongoose.model("SalesReturn", SalesReturnSchema);