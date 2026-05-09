const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    costPrice: { type: String },
    sellingPrice: { type: Number, required: true },
    gst: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },


    reorderLevel: {
        type: Number,
        default: 5
    },

    unitType: {
        type: String,
        enum: ["kg", "liter", "piece", "box"],
    },



    weight: {
        type: Number, 
        default: null
    },

    volume: {
        type: Number, 
        default: null
    },

    unitValue: {
        type: Number,
        default: 1
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
    },


}, { timestamps: true });

productSchema.index(
    { name: 1, superAdminId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Product", productSchema);