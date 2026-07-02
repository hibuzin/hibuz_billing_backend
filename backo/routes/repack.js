const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    createRepack,
    searchRepackProducts,
    getRepackProductsByBulk,
    getRepacks,
    getRepackById
} = require("../controllers/repack");

router.post(
    "/create",
    verifyToken,
    authorize("super_admin", "admin"),
    createRepack
);


router.post(
    "/create",
    verifyToken,
    authorize("super_admin", "admin"),
    searchRepackProducts
);


router.get(
    "/repack-by-bulk/:bulkProductId",
    verifyToken,
    getRepackProductsByBulk
);

router.get(
    "/getall",
    verifyToken,
    authorize("super_admin", "admin"),
    getRepacks
);

router.get(
    "/search",
    verifyToken,
    searchRepackProducts
);

router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    getRepackById
);



module.exports = router;