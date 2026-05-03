const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
    supplierId: {
        type: String,
        required: true
    },
    items: [
        {
            productId: {
                type: String,
                required: true
            },
            qty: {
                type: Number,
                required: true
            },
            costPrice: {
                type: Number,
                required: true
            }
        }
    ],
    totalAmount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Purchase", purchaseSchema);