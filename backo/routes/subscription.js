const express = require("express");

const router = express.Router();

const {
    createPlan,
    getPlans,
    getPlan,
    updatePlan,
    changeStatus,
    deletePlan
} = require("../controllers/subscription");



router.post("/plans", createPlan);

// Get All
router.get("/plans", getPlans);

// Get Single
router.get("/plans/:id", getPlan);

// Update
router.put("/plans/:id", updatePlan);

// Change Status
router.patch("/plans/:id/status", changeStatus);

// Delete
router.delete("/plans/:id", deletePlan);

module.exports = router;