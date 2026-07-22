const mongoose = require("mongoose");

const purchasePlanSchema = new mongoose.Schema({
    superAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    
    name: {
        type: String,
        required: true,
        trim: true
    },

    durationMonths: {
        type: Number,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    description: {
        type: String,
        default: ""
    },



    features: [{
        type: String
    }],

    isActive: {
        type: Boolean,
        default: true
    }
},
    {
        timestamps: true
    }
);

module.exports = mongoose.model("PurchasePlan", purchasePlanSchema);