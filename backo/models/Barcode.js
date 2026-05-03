const mongoose = require("mongoose");

const barcodeSchema = new mongoose.Schema({
    productId: mongoose.Schema.Types.ObjectId,
    code: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    isSold: { type: Boolean, default: false }
});

module.exports = mongoose.model("Barcode", barcodeSchema);