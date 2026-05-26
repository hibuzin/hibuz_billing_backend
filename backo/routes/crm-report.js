const express = require("express");
const router = express.Router();


const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    getCRMReport
}



router.get(
    "/customers/report",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getCRMReport
       
);

module.exports = router;