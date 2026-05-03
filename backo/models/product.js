const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    costPrice: { type: String },
    sellingPrice: { type: Number, required: true },
    gst: { type: Number, default: 0 },
    stock: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);