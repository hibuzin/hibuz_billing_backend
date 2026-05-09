const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
            select: false
        },

        role: {
            type: String,
            enum: ["super_admin", "admin", "cashier"],
            default: "cashier"
        },

        isActive: {
            type: Boolean,
            default: true
        },

        lastLogin: {
            type: Date
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },


        resetToken: {
            type: String,
            select: false
        },

        resetTokenExpire: {
            type: Date,
            select: false
        },

    },
    {
        timestamps: true
    }
);


userSchema.index({ email: 1, superAdminId: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);