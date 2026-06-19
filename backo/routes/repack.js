const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const { createRepack } = require("../controllers/repack");

router.post(
    "/create",
    verifyToken,
    authorize("super_admin", "admin"),
    createRepack
);

module.exports = router;