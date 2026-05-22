const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const adminUserController = require("../controllers/AdminUser");

router.post(
    "/create-cashier",
    verifyToken,
    authorize("admin"),
    adminUserController.adminCreateCashier
);

module.exports = router;