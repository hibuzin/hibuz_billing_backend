const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const Hsn = require("../models/Hsn");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");

const { attachHierarchy } = require("../utils/hierarchy");



router.post(
    "/create",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {

        try {

            const {
                hsnCode,
                description,
                gstRate,
                cess,
                category
            } = req.body;

            if (!hsnCode || gstRate == null) {
                return res.status(400).json({
                    success: false,
                    message: "HSN code and GST rate required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const exists = await Hsn.findOne({
                hsnCode,
                superAdminId: hierarchy.superAdminId
            });

            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: "HSN already exists"
                });
            }

            const gst = Number(gstRate);

            const newHsn = new Hsn({

                hsnCode,
                description,
                gstRate: gst,

                cgst: gst / 2,
                sgst: gst / 2,
                igst: gst,

                cess: cess || 0,
                category,

                superAdminId: hierarchy.superAdminId,
                createdBy: req.user.id
            });

            await newHsn.save();

            res.status(201).json({
                success: true,
                message: "HSN created",
                data: newHsn
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });

        }

    }
);


router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {

        try {

            const hierarchy = attachHierarchy(req.user);

            const hsnList = await Hsn.find({
                superAdminId: hierarchy.superAdminId
            }).sort({ createdAt: -1 });

            res.status(200).json({
                success: true,
                count: hsnList.length,
                data: hsnList
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });

        }

    }
);

router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {

        try {

            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid HSN ID"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const hsn = await Hsn.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!hsn) {
                return res.status(404).json({
                    success: false,
                    message: "HSN not found"
                });
            }

            res.status(200).json({
                success: true,
                data: hsn
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });

        }

    }
);

module.exports = router;