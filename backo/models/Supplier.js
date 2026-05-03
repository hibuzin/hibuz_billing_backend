const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
    supplierId: {
        type: Number,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    address: String
}, { timestamps: true });

module.exports = mongoose.model("Supplier", supplierSchema);