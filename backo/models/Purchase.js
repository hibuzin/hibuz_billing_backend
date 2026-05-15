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

    invoiceNo: {
        type: String,
        required: true,
        trim: true
    },

    invoiceDate: {
        type: Date,
        default: Date.now
    },

    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },

            hsnId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Hsn",
                default: null
            },

            hsnCode: {
                type: String,
                default: ""
            },

            gstpercentage: {
                type: Number,
                default: 0
            },

            categoryId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Category"
            },

            categoryName: {
                type: String,
                default: ""
            },



            brand: {
                type: String,
                default: ""
            },

            flavor: {
                type: String,
                default: ""
            },

            liters: {
                type: String,
                default: ""
            },

            qty: {
                type: Number

            },

            costPrice: {
                type: Number,
                required: true
            },

            mrp: {
                type: Number,
                default: 0
            },

            sellingPrice: {
                type: Number,
                default: 0
            },

            gst: {
                type: Number,
                default: 0
            },



            unitType: {
                type: String,
                enum: ["kg", "liter", "piece", "box"],
                default: "piece"
            },

            unitValue: {
                type: Number,
                default: 1
            },

            barcode: {
                type: String,
                default: ""
            },

            receivedQty: {
                type: Number,
                default: 0
            },

            pendingQty: {
                type: Number,
                default: 0
            }
        }
    ],

    stock: {
        type: Number,
        default: 0
    },


    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
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
    },

    totalAmount: {
        type: Number,
        required: true
    }

}, { timestamps: true });

module.exports = mongoose.model("Purchase", purchaseSchema);