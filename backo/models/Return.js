const mongoose = require("mongoose");

const purchaseReturnRequestSchema = new mongoose.Schema(
    {
        purchaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Purchase",
            required: true
        },

        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Supplier",
            required: true
        },

        items: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },
                qty: {
                    type: Number,
                    required: true
                },
                reason: {
                    type: String,
                    default: ""
                }
            }
        ],

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending"
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

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "PurchaseReturnRequest",
    purchaseReturnRequestSchema
);