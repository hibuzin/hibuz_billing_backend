const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Category = require("../models/category");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");
const Hsn = require("../models/Hsn");

router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const {
                name,
                hsnCode,
                description,
                gstRate,
                cess
            } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: "Category name required"
                });
            }

            if (!hsnCode || gstRate == null) {
                return res.status(400).json({
                    success: false,
                    message: "HSN code and GST rate required"
                });
            }

            const hierarchy = attachHierarchy(req.user);
            const userId = req.user.userId || req.user.id;

            const exists = await Category.findOne({
                name: name.trim(),
                superAdminId: hierarchy.superAdminId
            });

            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: "Category already exists"
                });
            }

            let hsn = await Hsn.findOne({
                hsnCode: String(hsnCode).trim(),
                superAdminId: hierarchy.superAdminId
            });

            if (!hsn) {
                const gst = Number(gstRate);

                hsn = await Hsn.create({
                    hsnCode: String(hsnCode).trim(),
                    description,
                    gstRate: gst,
                    cgst: gst / 2,
                    sgst: gst / 2,
                    igst: gst,
                    cess: cess || 0,
                    category: name.trim(),
                    ...hierarchy,
                    createdBy: userId
                });
            }

            const category = await Category.create({
                name: name.trim(),
                hsnId: hsn._id,
                hsnCode: hsn.hsnCode,
                gstRate: hsn.gstRate,
                ...hierarchy,
                createdBy: userId,
                roleCreatedBy: req.user.role
            });

            res.status(201).json({
                success: true,
                message: "Category and HSN created successfully",
                data: {
                    category,
                    hsn
                }
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
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


            const categories = await Category.find({
                superAdminId: hierarchy.superAdminId
            }).sort({
                createdAt: -1
            });

            res.json({
                success: true,
                count: categories.length,
                data: categories
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
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

            const hierarchy = attachHierarchy(req.user);


            const category = await Category.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found"
                });
            }

            res.json({
                success: true,
                data: category
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);



router.put(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {

            const { id } = req.params;
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: "Category name required"
                });
            }

            const hierarchy = attachHierarchy(req.user);


            const category = await Category.findOneAndUpdate(
                {
                    _id: id,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $set: {
                        name: name.trim()
                    }
                },
                {
                    new: true
                }
            );

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found"
                });
            }

            res.json({
                success: true,
                message: "Category updated successfully",
                data: category
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);



router.delete(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {

            const { id } = req.params;

            const hierarchy = attachHierarchy(req.user);


            const deleted = await Category.findOneAndDelete({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found"
                });
            }

            res.json({
                success: true,
                message: "Category deleted successfully",
                deletedId: deleted._id
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);

module.exports = router;