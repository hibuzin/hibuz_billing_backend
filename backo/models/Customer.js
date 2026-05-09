const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        customerId: {
            type: Number,
            required: true,
            unique: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true

        },

        email: {
            type: String,
            default: "",
        },

        address: {
            type: String,
            default: "",
        },

        totalPurchases: {
            type: Number,
            default: 0,
        },

        loyaltyPoints: {
            type: Number,
            default: 0,
        },

        totalSpent: {
            type: Number,
            default: 0,
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        roleCreatedBy: {
            type: String
        },
    },


    { timestamps: true }
);

customerSchema.set("toJSON", {
    transform: (doc, ret) => {
        ret.id = ret.customerId;
        delete ret._id;
        delete ret.__v;
        delete ret.customerId;
        return ret;
    }
});

module.exports = mongoose.model("Customer", customerSchema);