const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Barcode = require("../models/Barcode");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const category = require("../models/category");
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
            const {
                name,
                costPrice,
                sellingPrice,
                categoryId,
                stock,
                gst,
                unitType,
                unitValue
            } = req.body;

            const code = String(req.body.code || req.body.barcode || "").trim();

            if (!name || !sellingPrice || !categoryId || !unitType || !code) {
                return res.status(400).json({
                    success: false,
                    message: "Required fields missing"
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

            const exists = await Barcode.findOne({
                code,
                superAdminId: hierarchy.superAdminId
            });

            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: "Barcode already exists"
                });
            }

            const product = await Product.create({
                name: name.trim(),
                costPrice: costPrice ? Number(costPrice) : 0,
                sellingPrice: Number(sellingPrice),
                gst: gst ? Number(gst) : 0,
                stock: stock ? Number(stock) : 0,

                categoryId,
                unitType,
                unitValue: unitValue ? Number(unitValue) : 1,

                ...hierarchy
            });

            const barcode = await Barcode.create({
                productId: product._id,
                code,
                isSold: false,
                superAdminId: hierarchy.superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Product created successfully",
                data: product,
                barcode
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
            const { page = 1, limit = 10, search = "" } = req.query;
            const { userId, role, superAdminId, adminId } = req.user;



            let finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

            const query = {
                superAdminId: finalSuperAdminId
            };


            if (search) {
                query.name = { $regex: search, $options: "i" };
            }

            const products = await Product.find(query)
                .populate("categoryId", "name")
                .skip((Number(page) - 1) * Number(limit))
                .limit(Number(limit))
                .sort({ createdAt: -1 })
                .lean();

            for (let product of products) {
                const barcodes = await Barcode.find({
                    productId: product._id,
                    superAdminId: finalSuperAdminId
                }).select("code isSold -_id");

                product.barcodes = barcodes;
            }


            const total = await Product.countDocuments(query);

            res.json({
                success: true,
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
                pages: Math.ceil(total / Number(limit)),
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
            const { userId, role, superAdminId } = req.user;

            const finalSuperAdminId =
                role === "super_admin" ? userId : superAdminId;

          
            const product = await Product.findOne({
                _id: id,
                superAdminId: finalSuperAdminId
            })
                .populate("categoryId", "name")
                .lean();

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const barcodes = await Barcode.find({
                productId: product._id,
                superAdminId: finalSuperAdminId
            }).select("code isSold -_id");

            product.barcodes = barcodes;

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

            const {
                name,
                costPrice,
                sellingPrice,
                categoryId,
                gst,
                stock,
                unitType,
                unitValue,
                code
            } = req.body;

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

           
            if (code) {

                const barcodeExists = await Barcode.findOne({
                    code,
                    productId: { $ne: product._id },
                    superAdminId: hierarchy.superAdminId
                });

                if (barcodeExists) {
                    return res.status(400).json({
                        success: false,
                        message: "Barcode already exists"
                    });
                }

                await Barcode.findOneAndUpdate(
                    { productId: product._id },
                    { code }
                );
            }

            
            if (name) product.name = name.trim();
            if (costPrice !== undefined)
                product.costPrice = Number(costPrice);

            if (sellingPrice !== undefined)
                product.sellingPrice = Number(sellingPrice);

            if (gst !== undefined)
                product.gst = Number(gst);

            if (stock !== undefined)
                product.stock = Number(stock);

            if (unitType) product.unitType = unitType;

            if (unitValue !== undefined)
                product.unitValue = Number(unitValue);

            await product.save();

            res.json({
                success: true,
                message: "Product updated successfully",
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


router.delete("/delete-all",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {

            const hierarchy = attachHierarchy(req.user);

           
            const products = await Product.find({
                superAdminId: hierarchy.superAdminId
            }).select("_id");

            const productIds = products.map(p => p._id);

            
            await Barcode.deleteMany({
                productId: { $in: productIds }
            });

           
            const deletedProducts = await Product.deleteMany({
                superAdminId: hierarchy.superAdminId
            });

            res.json({
                success: true,
                message: "All products deleted successfully",
                deletedCount: deletedProducts.deletedCount
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
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {

            const { id } = req.params;

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

           
            await Barcode.deleteMany({
                productId: product._id
            });

           
            await Product.findByIdAndDelete(product._id);

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