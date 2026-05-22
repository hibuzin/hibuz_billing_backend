const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Product = require("../models/Product");
const Barcode = require("../models/Barcode");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const category = require("../models/category");
const Hsn = require("../models/Hsn");
const { attachHierarchy } = require("../utils/hierarchy");


const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
};

router.post(
    "/add",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { name, brand, categoryId, flavor, litters, mrps, hsnCode } = req.body;

            if (!name || !categoryId) {
                return res.status(400).json({
                    success: false,
                    message: "Name and category are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const cat = await category.findOne({
                _id: categoryId,
                superAdminId: hierarchy.superAdminId
            });

            if (!cat) {
                return res.status(404).json({
                    success: false,
                    message: "Category not found"
                });
            }

            let hsnData = null;

            if (hsnCode) {

                hsnData = await Hsn.findOne({
                    hsnCode: String(hsnCode).trim(),
                    superAdminId: hierarchy.superAdminId,
                    isActive: true
                });

                if (!hsnData) {
                    return res.status(404).json({
                        success: false,
                        message: "HSN code not found"
                    });
                }
            }

            const processedFlavors = Array.isArray(flavor)
                ? flavor.map(x => String(x).trim()).filter(Boolean)
                : [];

            const processedLitters = Array.isArray(litters)
                ? litters.map(x => String(x).trim()).filter(Boolean)
                : [];

            const processedMrps = Array.isArray(mrps)
                ? mrps.map(x => Number(x)).filter(x => !isNaN(x) && x > 0)
                : [];

            if (processedMrps.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one valid MRP is required"
                });
            }

            const product = await Product.create({
                name: String(name).trim(),
                brand: brand ? String(brand).trim() : "",

                stock: 0,
                reservedStock: 0,


                flavor: processedFlavors,
                litters: processedLitters,
                mrps: processedMrps,

                categoryId,


                hsnCode: hsnData ? hsnData.hsnCode : "",
                gstRate: hsnData ? hsnData.gstRate : 0,

                ...hierarchy,
                createdBy: req.user.userId
            });

            res.status(201).json({
                success: true,
                message: "Product created successfully",
                data: product
            });

        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: "Product already exists"
                });
            }

            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);


router.get(
    "/product-mrps/:productId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { productId } = req.params;

            const hierarchy = attachHierarchy(req.user);

            const product = await Product.findOne({
                _id: productId,
                superAdminId: hierarchy.superAdminId
            }).select("name brand flavor litters variants");

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            res.json({
                success: true,
                productId: product._id,
                name: product.name,
                brand: product.brand,
                flavor: product.flavor,
                litters: product.litters,
                mrps: product.variants.map(v => ({
                    variantId: v._id,
                    mrp: v.mrp
                }))
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

            const products = await Product.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("categoryId", "name")
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                count: products.length,
                data: products
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

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid product id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const product = await Product.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            }).populate("categoryId", "name");

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            res.json({
                success: true,
                data: product
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
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, brand, categoryId, flavor, litters, mrps } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid product id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const product = await Product.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            if (categoryId) {
                const cat = await category.findOne({
                    _id: categoryId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!cat) {
                    return res.status(404).json({
                        success: false,
                        message: "Category not found"
                    });
                }

                product.categoryId = categoryId;
            }

            if (name) product.name = String(name).trim();
            if (brand !== undefined) product.brand = String(brand).trim();

            if (Array.isArray(flavor)) {
                product.flavor = flavor
                    .map(x => String(x).trim())
                    .filter(Boolean);
            }

            if (Array.isArray(litters)) {
                product.litters = litters
                    .map(x => String(x).trim())
                    .filter(Boolean);
            }

            if (Array.isArray(mrps)) {
                const processedMrps = mrps
                    .map(x => Number(x))
                    .filter(x => !isNaN(x) && x > 0);

                if (processedMrps.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "At least one valid MRP is required"
                    });
                }

                product.mrps = processedMrps;
            }

            product.updatedBy = req.user.userId;

            await product.save();

            res.json({
                success: true,
                message: "Product updated successfully",
                data: product
            });

        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: "Product already exists"
                });
            }

            res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);



router.delete(
    "/delete/all",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {

            const hierarchy = attachHierarchy(req.user);

            const result = await Product.deleteMany({
                superAdminId: hierarchy.superAdminId
            });

            res.json({
                success: true,
                message: "All products deleted successfully",
                deletedCount: result.deletedCount
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

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid product id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const product = await Product.findOneAndDelete({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            res.json({
                success: true,
                message: "Product deleted successfully"
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