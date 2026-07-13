const SubscriptionPlan = require("../models/subscription");


// Create Plan
exports.createPlan = async (req, res) => {
    try {

        const existing = await SubscriptionPlan.findOne({
            planCode: req.body.planCode.toUpperCase()
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Plan code already exists"
            });
        }

        const plan = await SubscriptionPlan.create(req.body);

        res.status(201).json({
            success: true,
            message: "Subscription plan created successfully",
            data: plan
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


// Get All Plans
exports.getPlans = async (req, res) => {

    try {

        const plans = await SubscriptionPlan.find().sort({ price: 1 });

        res.json({
            success: true,
            data: plans
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Get Single Plan
exports.getPlan = async (req, res) => {

    try {

        const plan = await SubscriptionPlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        res.json({
            success: true,
            data: plan
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Update Plan
exports.updatePlan = async (req, res) => {

    try {

        const plan = await SubscriptionPlan.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        res.json({
            success: true,
            message: "Subscription plan updated successfully",
            data: plan
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Change Status
exports.changeStatus = async (req, res) => {

    try {

        const { isActive } = req.body;

        const plan = await SubscriptionPlan.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        res.json({
            success: true,
            message: "Status updated successfully",
            data: plan
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Delete Plan
exports.deletePlan = async (req, res) => {

    try {

        const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        res.json({
            success: true,
            message: "Subscription plan deleted successfully"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};