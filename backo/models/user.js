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
            unique: true,
            lowercase: true,
            trim: true
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

    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);