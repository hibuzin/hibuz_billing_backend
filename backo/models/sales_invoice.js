const mongoose = require("mongoose");

const salesInvoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true
        },

        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer"
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

                price: {
                    type: Number,
                    required: true
                },

                total: {
                    type: Number,
                    required: true
                }
            }
        ],

        subTotal: {
            type: Number,
            default: 0
        },

        gstAmount: {
            type: Number,
            default: 0
        },

        discount: {
            type: Number,
            default: 0
        },

        grandTotal: {
            type: Number,
            required: true
        },

        paymentMethod: {
            type: String,
            enum: ["cash", "card", "upi"],
            default: "cash"
        },

        status: {
            type: String,
            enum: ["completed", "cancelled"],
            default: "completed"
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
            ref: "User"
        }
    },
    { timestamps: true }
);

module.exports =
  mongoose.models.SalesInvoice ||
  mongoose.model("SalesInvoice", salesInvoiceSchema);