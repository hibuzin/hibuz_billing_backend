const User = require("../models/user");
const PurchasePlan = require("../models/purchase_plan");


exports.activateSubscription = async (req, res) => {
    try {

        const { userId, planId } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const plan = await PurchasePlan.findById(planId);

        if (!plan || !plan.isActive) {
            return res.status(404).json({
                success: false,
                message: "Subscription plan not found"
            });
        }

        const startDate = new Date();

        const endDate = new Date();
        endDate.setMonth(
            endDate.getMonth() + plan.durationMonths
        );

        user.subscription = {
            status: "active",
            plan: plan.name,
            startDate,
            endDate
        };

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Subscription activated successfully",
            subscription: user.subscription
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};