const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
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

            name: String,
            brand: String,
            flavor: String,
            litters: String,

            mrp: Number,
            price: Number,

            qty: {
                type: Number,
                default: 1
            },

            gstRate: Number,
            gstAmount: Number,
            finalPrice: Number
        }
    ],

    summary: {
        subTotal: {
            type: Number,
            default: 0
        },
        totalGST: {
            type: Number,
            default: 0
        },
        discount: {
            type: Number,
            default: 0
        },
        grandTotal: {
            type: Number,
            default: 0
        }
    },

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null
    },

    paymentMethod: {
        type: String,
        enum: ["cash", "card", "upi"],
        default: "cash"
    },

    paymentStatus: {
        type: String,
        enum: ["paid", "pending", "cancelled"],
        default: "paid"
    },

    role: {
        type: String,
        default: ""
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
        ref: "User"
    }
}, { timestamps: true });

module.exports = mongoose.models.Bill || mongoose.model("Bill", billSchema);