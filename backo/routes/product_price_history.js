const express = require("express");
const router = express.Router();

const authorize = require("../middleware/role");
const { verifyToken } = require("../middleware/auth");

const mongoose = require("mongoose");

const {
    getProductPriceHistory
} = require("../controllers/product_price_history");

router.get(
    "/history/:productId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getProductPriceHistory
);

module.exports = router;