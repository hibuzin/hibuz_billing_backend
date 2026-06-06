const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");



const {
    createBill,
    searchProductsForBill,
    searchCustomerBills,
    getBills,
    salescheck,
    cashierWiseSales,
    getBillById
} = require("../controllers/bill");


router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createBill
);

router.get("/search-product",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    searchProductsForBill
);

router.get(
    "/search/customer",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    searchCustomerBills
);

router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getBills
);



router.get(
    "/sales-check",
    verifyToken,
    authorize("super_admin", "admin"),
    salescheck
);



router.get(
    "/cashier-wise-sales",
    verifyToken,
    authorize("super_admin", "admin"),
    cashierWiseSales
);



router.get("/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getBillById
);


module.exports = router;