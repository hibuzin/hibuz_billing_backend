const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const AuditLog = require("../models/audit_log");
const { attachHierarchy } = require("../utils/hierarchy");

const{
    getAuditLogs,
    getAuditLogsByid
} = require("../controllers/audit_logs");

router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin"),
    getAuditLogs
       
);


router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    getAuditLogsByid
);

module.exports = router;