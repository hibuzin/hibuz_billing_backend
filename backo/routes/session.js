const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    startSession,
    endSession,
    todaySessions,
    sessionReport
} = require("../controllers/session");

router.post(
    "/start",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    startSession
);

router.post(
    "/end",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    endSession
);

router.get(
    "/today",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    todaySessions
);

router.get(
    "/report",
    verifyToken,
    authorize("super_admin", "admin"),
    sessionReport
);

module.exports = router;