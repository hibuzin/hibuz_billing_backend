const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const {
        createExpenseCategory,
        createExpense
        
} = require("../controllers/expense");


router.post(
    "/category",
    verifyToken,
    authorize("super_admin", "admin"),
    createExpenseCategory
);

router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createExpense
);

module.exports = router;