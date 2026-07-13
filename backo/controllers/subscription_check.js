exports.checkSubscription = async (req, res) => {
    try {

        let ownerId;

        if (req.user.role === "super_admin") {
            ownerId = req.user.userId;
        } else {
            ownerId = req.user.superAdminId;
        }

        const subscription = await Subscription.findOne({
            userId: ownerId
        }).sort({ createdAt: -1 });

        if (!subscription) {
            return res.status(200).json({
                success: false,
                hasSubscription: false,
                message: "No subscription found."
            });
        }

        if (subscription.endDate < new Date()) {

            if (subscription.status !== "expired") {
                subscription.status = "expired";
                await subscription.save();
            }

            return res.status(200).json({
                success: false,
                hasSubscription: false,
                message: "Subscription expired."
            });
        }

        return res.status(200).json({
            success: true,
            hasSubscription: true,
            subscription
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};