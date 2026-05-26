const AuditLog = require("../models/audit_log");
const { attachHierarchy } = require("../utils/hierarchy");

exports.getAuditLogs = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const {
            module,
            action,
            userId,
            fromDate,
            toDate,
            page = 1,
            limit = 20
        } = req.query;

        const filter = {
            superAdminId: hierarchy.superAdminId
        };

        if (module) filter.module = module;
        if (action) filter.action = action;
        if (userId) filter.userId = userId;

        if (fromDate || toDate) {
            filter.createdAt = {};

            if (fromDate) {
                filter.createdAt.$gte = new Date(fromDate);
            }

            if (toDate) {
                filter.createdAt.$lte = new Date(toDate);
            }
        }

        const skip = (Number(page) - 1) * Number(limit);

        const logs = await AuditLog.find(filter)
            .populate("userId", "name email role")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await AuditLog.countDocuments(filter);

        res.json({
            success: true,
            count: logs.length,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            data: logs
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
}

exports.getAuditLogsByid = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const log = await AuditLog.findOne({
            _id: req.params.id,
            superAdminId: hierarchy.superAdminId
        }).populate("userId", "name email role");

        if (!log) {
            return res.status(404).json({
                success: false,
                message: "Audit log not found"
            });
        }

        res.json({
            success: true,
            data: log
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
}