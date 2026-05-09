const mongoose = require("mongoose");

const barcodeSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        code: {
            type: String,
        
            trim: true
        },

        isSold: {
            type: Boolean,
            default: false
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

barcodeSchema.index(
    { code: 1, superAdminId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Barcode", barcodeSchema);