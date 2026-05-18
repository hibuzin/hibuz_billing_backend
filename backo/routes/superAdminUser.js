const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    createUser
} = require("../controllers/superAdminUser");

router.post(
    "/create-user",
    verifyToken,
    authorize("super_admin"),
    createUser
);

module.exports = router;