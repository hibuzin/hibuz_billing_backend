const mongoose = require("mongoose");


const productSchema = new mongoose.Schema({

    name: { type: String, required: true },

    description: {
        type: String,
        default: "",
        trim: true
    },

    stock: {
        type: Number,
        default: 0
    },

    lowStockQty: {
        type: Number,
        default: 10
    },

    reservedStock: {
        type: Number,
        default: 0
    },

    mrp: {
        type: Number
    },

    costPrice: {
        type: Number,
        default: 0
    },

    sellingPrice: {
        type: Number,
        default: 0
    },

    priceLevel: {
        pricingType: {
            type: String,
            enum: ["manual", "auto", "slab"],
            default: "manual"
        },

        manualPrice: {
            type: Number,
            default: 0
        },

        autoPricing: {
            baseOn: {
                type: String,
                enum: ["costPrice", "mrp"],
                default: "costPrice"
            },
            profitPercent: {
                type: Number,
                default: 0
            }
        },

        slabs: [
            {
                minQty: {
                    type: Number,
                    required: true
                },

                maxQty: {
                    type: Number,
                    default: null
                },

                price: {
                    type: Number,
                    required: true
                }
            }
        ]
    },

    hsnCode: {
        type: String,
        default: ""
    },

    gstRate: {
        type: Number,
        default: 0
    },

    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },

    categoryName: {
        type: String,
        default: ""
    },

    hsnId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hsn",
        default: null
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
        ref: "User",
        required: true
    }
}, { timestamps: true });

module.exports =
    mongoose.models.Product ||
    mongoose.model("Product", productSchema);