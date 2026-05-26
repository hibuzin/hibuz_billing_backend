const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    getSuperAdminMe,
    updateSuperAdminMe,
    createSeperateAccount,
    getSeperateAccount,
    updateSeperateAccount
} = require("../controllers/super_admin_profile");


router.post(
    "/seperate/create",
    verifyToken,
    authorize("super_admin"),
    createSeperateAccount
);



router.get(
    "/me",
    verifyToken,
    authorize("super_admin"),
    getSuperAdminMe
);

router.get(
    "/seperate",
    verifyToken,
    authorize("super_admin"),
    getSeperateAccount
);


router.put(
    "/me",
    verifyToken,
    authorize("super_admin"),
    updateSuperAdminMe
);

router.put(
    "/seperate/:id",
    verifyToken,
    authorize("super_admin"),
    updateSeperateAccount
);

module.exports = router;