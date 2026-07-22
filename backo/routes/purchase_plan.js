const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const {
    createPlan,
    getPlans,
    getPlanById,
    updatePlan,
    deletePlan
} = require("../controllers/purchase_plan");

router.post(
    "/",
    verifyToken,
    authorize("super_admin"),
    createPlan
);

router.get(
    "/",
    verifyToken,
    authorize("super_admin"),
    getPlans
);

router.get(
    "/:id",
    verifyToken,
    authorize("super_admin"),
    getPlanById
);

router.put(
    "/:id",
    verifyToken,
    authorize("super_admin"),
    updatePlan
);

router.delete(
    "/:id",
    verifyToken,
    authorize("super_admin"),
    deletePlan
);

module.exports = router;