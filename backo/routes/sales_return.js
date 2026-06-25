
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const {
    createSalesReturn,
    getSalesReturns,
    getSalesReturnById
} = require("../controllers/sales_return");

router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createSalesReturn
);



router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getSalesReturns
);

router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getSalesReturnById
);

module.exports = router;