const User = require("../models/user");

const checkSubscription = async (req, res, next) => {
    try {
        
         if (req.user.role !== "super_admin") {
            return next();
        }

        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (!user.subscription || user.subscription.status !== "active") {
            return res.status(403).json({
                success: false,
                subscriptionRequired: true,
                message: "Please activate your subscription."
            });
        }

        if (
            user.subscription.endDate &&
            new Date(user.subscription.endDate) < new Date()
        ) {
            user.subscription.status = "expired";
            await user.save();

            return res.status(403).json({
                success: false,
                subscriptionRequired: true,
                message: "Subscription expired."
            });
        }

        next();

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports = checkSubscription;