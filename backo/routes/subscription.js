const express = require("express");
const router = express.Router();

const { activateSubscription } = require("../controllers/subscription");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

// Only Super Admin can activate subscription
router.post(
    "/activate",
    verifyToken,
    authorize("super_admin"),
    activateSubscription
);

module.exports = router;