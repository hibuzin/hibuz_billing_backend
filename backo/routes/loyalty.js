const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");



const {
    createLoyalty,
    redeemLoyalty,
    loyaltycustomerbyid
} = require("../controllers/loyalty");


router.post("/loyalty/add",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createLoyalty
);


router.post("/loyalty/redeem",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    redeemLoyalty

);


router.get("/loyalty/:customerId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    loyaltycustomerbyid

);


module.exports = router;