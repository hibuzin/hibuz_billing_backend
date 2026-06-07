const express = require("express");
const router = express.Router();


const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    getCRMReport,
    customerItemWiseReport
} = require("../controllers/crm_report");



router.get(
    "/customers/report",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getCRMReport
       
);

router.get(
    "/customer-item-wise",
    verifyToken,
    authorize("super_admin", "admin"),
    customerItemWiseReport
);

module.exports = router;