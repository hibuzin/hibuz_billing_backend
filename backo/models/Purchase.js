const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
        required: true
    },

    grnDate: {
        type: Date
    },


    items: [
        {
            productId: {
                type: String,
                required: true
            },
            qty: {
                type: Number,
                required: true
            },
            costPrice: {
                type: Number,
                required: true
            }
        }
    ],
    totalAmount: {
        type: Number,
        required: true
    },

    receivedQty: {
        type: Number,
        default: 0
    },

    pendingQty: {
        type: Number,
        default: 0
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

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }


}, { timestamps: true });

module.exports = mongoose.model("Purchase", purchaseSchema);