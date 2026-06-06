const mongoose = require("mongoose");


const productSchema = new mongoose.Schema({

    name: { type: String, required: true },

    brand: {
        type: String,
        default: "",
        trim: true
    },

    stock: {
        type: Number,
        default: 0
    },

    reservedStock: {
        type: Number,
        default: 0
    },


    flavor: [{
        type: String,
        trim: true
    }],

    litters: [{
        type: String,
        trim: true
    }],

    kg: [
        {
            type: String
        }
    ],

    mrps: [{
        type: Number
    }],

    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
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

    gstRate: {
        type: Number,
        default: 0
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