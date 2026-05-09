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
    address: String,

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

module.exports = mongoose.model("Supplier", supplierSchema);