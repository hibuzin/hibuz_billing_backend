const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    createRepack,
    getRepacks,
    getRepackById
} = require("../controllers/repack");

router.post(
    "/create",
    verifyToken,
    authorize("super_admin", "admin"),
    createRepack
);

router.get(
    "/getall",
    verifyToken,
    authorize("super_admin", "admin"),
    getRepacks
);

router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    getRepackById
);



module.exports = router;