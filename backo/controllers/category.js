const mongoose = require("mongoose");
const User = require("../models/user");
const Category = require("../models/category");
const Hsn = require("../models/hsn");
const AuditLog = require("../models/audit_log");
const { attachHierarchy } = require("../utils/hierarchy");

exports.createCategory = async (req, res) => {
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

        if (!hsnCode) {
            return res.status(400).json({
                success: false,
                message: "HSN code required"
            });
        }
        const hierarchy = attachHierarchy(req.user);
        const userId = req.user.userId || req.user.id;

        if (
            gstRate !== undefined &&
            gstRate !== null &&
            String(gstRate).toLowerCase() !== "none" &&
            Number(gstRate) > 0
        ) {

            await AuditLog.create({
                userId,
                role: req.user.role,

                module: "GST",
                action: "CREATE",

                documentId: category._id,

                oldData: null,

                newData: {
                    categoryName: category.name,
                    hsnCode: category.hsnCode,
                    gstRate: category.gstRate
                },

                ...hierarchy
            });
        }

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

            let gst = 0;

            if (
                gstRate !== undefined &&
                gstRate !== null &&
                String(gstRate).toLowerCase() !== "none"
            ) {
                gst = Number(gstRate);

                if (isNaN(gst)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid GST rate"
                    });
                }
            }

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
};


exports.getCategories = async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);

        const categories = await Category.find({
            superAdminId: hierarchy.superAdminId
        })
            .sort({ createdAt: -1 })
            .populate("hsnId");

        return res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};


exports.getCategoryById = async (req, res) => {
    try {

        const { id } = req.params;

        const hierarchy = attachHierarchy(req.user);

        const category = await Category.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        }).populate("hsnId");

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: category
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};


exports.updateCategory = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            name,
            hsnCode,
            description,
            gstRate,
            cess,
            isActive
        } = req.body;

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

        let hsn = null;

        if (hsnCode) {

            let gst = 0;

            if (
                gstRate !== undefined &&
                gstRate !== null &&
                String(gstRate).toLowerCase() !== "none"
            ) {
                gst = Number(gstRate);

                if (isNaN(gst)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid GST rate"
                    });
                }
            }

            hsn = await Hsn.findOne({
                hsnCode: String(hsnCode).trim(),
                superAdminId: hierarchy.superAdminId
            });

            if (hsn) {
                
                hsn.gstRate = gst;
                hsn.cgst = gst / 2;
                hsn.sgst = gst / 2;
                hsn.igst = gst;

                if (description !== undefined) {
                    hsn.description = description;
                }

                if (cess !== undefined) {
                    hsn.cess = cess;
                }

                hsn.category = name || category.name;

                await hsn.save();

            } else {
                
                hsn = await Hsn.create({
                    hsnCode: String(hsnCode).trim(),
                    description,
                    gstRate: gst,
                    cgst: gst / 2,
                    sgst: gst / 2,
                    igst: gst,
                    cess: cess || 0,
                    category: name || category.name,
                    ...hierarchy,
                    createdBy: req.user.userId || req.user.id
                });
            }
        }

        if (name) {
            category.name = name.trim();
        }

        if (typeof isActive === "boolean") {
            category.isActive = isActive;
        }

        if (hsn) {
            category.hsnId = hsn._id;
            category.hsnCode = hsn.hsnCode;
            category.gstRate = hsn.gstRate;
        }

        await category.save();

        const updated = await Category.findById(category._id)
            .populate("hsnId");

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: updated
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};

exports.deleteCategory = async (req, res) => {
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

        await Category.deleteOne({
            _id: category._id
        });

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};