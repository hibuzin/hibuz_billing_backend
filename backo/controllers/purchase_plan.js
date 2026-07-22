const PurchasePlan = require("../models/purchase_plan");


exports.createPlan = async (req, res) => {
    try {

        const {
            name,
            durationMonths,
            price,
            description,
            features
        } = req.body;

        if (!name || !durationMonths || !price) {
            return res.status(400).json({
                success: false,
                message: "Name, durationMonths and price are required"
            });
        }

        

        const plan = await PurchasePlan.create({
            superAdminId: req.user.superAdminId,
            name: name.trim(),
            durationMonths,
            price,
            description: description || "",
            features: features || []
        });

        return res.status(201).json({
            success: true,
            message: "Purchase plan created successfully",
            plan
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};



exports.getPlans = async (req, res) => {
    try {

        const plans = await PurchasePlan.find({
            isActive: true
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: plans.length,
            plans
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};



exports.getPlanById = async (req, res) => {
    try {

        const plan = await PurchasePlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Purchase plan not found"
            });
        }

        return res.status(200).json({
            success: true,
            plan
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


// Update Plan
exports.updatePlan = async (req, res) => {
    try {

        const {
            name,
            durationMonths,
            price,
            description,
            features,
            isActive
        } = req.body;

        const plan = await PurchasePlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Purchase plan not found"
            });
        }

        if (name !== undefined) {
            plan.name = name.trim();
        }

        if (durationMonths !== undefined) {
            plan.durationMonths = durationMonths;
        }

        if (price !== undefined) {
            plan.price = price;
        }

        if (description !== undefined) {
            plan.description = description;
        }

        if (features !== undefined) {
            plan.features = features;
        }

        if (isActive !== undefined) {
            plan.isActive = isActive;
        }

        await plan.save();

        return res.status(200).json({
            success: true,
            message: "Purchase plan updated successfully",
            plan
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


// Soft Delete Plan
exports.deletePlan = async (req, res) => {
    try {

        const plan = await PurchasePlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Purchase plan not found"
            });
        }

        plan.isActive = false;

        await plan.save();

        return res.status(200).json({
            success: true,
            message: "Purchase plan deleted successfully"
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};