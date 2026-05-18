const mongoose = require("mongoose");

const superAdminUserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            default: ""
        },

    email: {
    type: String,
    default: ""
},

    phone: {
    type: String,
    default: ""
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

    createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
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
}
    });

module.exports = mongoose.model("SuperAdminUser", superAdminUserSchema);