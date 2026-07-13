const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
{
    planName: {
        type: String,
        required: true
    },

    planCode: {
        type: String,
        required: true,
        unique: true
    },

    duration: {
        type: String,
        enum: ["monthly", "yearly"],
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    currency: {
        type: String,
        default: "INR"
    },

    description: {
        type: String,
        default: ""
    },

    features: [{
        type: String
    }],

    maxUsers: {
        type: Number,
        default: 1
    },

    maxBranches: {
        type: Number,
        default: 1
    },

    isActive: {
        type: Boolean,
        default: true
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);