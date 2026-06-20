const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        customerId: {
            type: Number,
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        gstNumber: {
            type: String,
            default: "",
            trim: true,
            uppercase: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        bankDetails: {
            accountHolderName: { type: String, default: "" },
            bankName: { type: String, default: "" },
            accountNumber: { type: String, default: "" },
            ifscCode: { type: String, default: "" },
            branchName: { type: String, default: "" }
        },

        email: {
            type: String,
            default: "",
            trim: true
        },

        address: {
            type: String,
            default: "",
            trim: true
        },

        totalPurchases: {
            type: Number,
            default: 0
        },

        loyaltyPoints: {
            type: Number,
            default: 0
        },

        totalSpent: {
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
            ref: "User"
        },

        roleCreatedBy: {
            type: String,
            enum: ["super_admin", "admin", "cashier"]
        }
    },
    {
        timestamps: true
    }
);




customerSchema.index(
    { superAdminId: 1, customerId: 1 },
    { unique: true }
);


customerSchema.index(
    { superAdminId: 1, phone: 1 },
    { unique: true }
);


customerSchema.index({
    superAdminId: 1,
    name: 1
});




customerSchema.set("toJSON", {
    transform: (doc, ret) => {


        ret.id = ret.customerId;

        delete ret.customerId;
        delete ret.__v;

        return ret;
    }
});



module.exports =
    mongoose.models.Customer ||
    mongoose.model("Customer", customerSchema);