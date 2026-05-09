const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Category = require("../models/category");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");




router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: "Category name required"
                });
            }

            const hierarchy = attachHierarchy(req.user);


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

            const category = await Category.create({
                name: name.trim(),
                ...hierarchy,
                createdBy: req.user.userId,
                roleCreatedBy: req.user.role
            });

            res.status(201).json({
                success: true,
                message: "Category created successfully",
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