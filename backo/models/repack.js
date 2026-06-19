const mongoose = require("mongoose");

const repackSchema = new mongoose.Schema(
    {
        repackNo: String,

        fromProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        fromBarcode: String,
        fromQty: Number,

        outputs: [
            {
                toProductId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },
                toBarcode: String,
                toQty: Number,
                toUnitKg: Number
            }
        ],

        note: String,

        superAdminId: mongoose.Schema.Types.ObjectId,
        adminId: mongoose.Schema.Types.ObjectId,
        createdBy: mongoose.Schema.Types.ObjectId
    },
    { timestamps: true }
);

module.exports = mongoose.model("Repack", repackSchema);