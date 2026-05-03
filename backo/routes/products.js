const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Barcode = require("../models/Barcode");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
};

const generateUniqueBarcodes = async (count) => {
    const codes = new Set();

    while (codes.size < count) {
        const code = generateBarcode();

        const exists = await Barcode.exists({ code });

        if (!exists) {
            codes.add(code);
        }
    }

    return [...codes];
};

router.post("/",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const {
                name,
                sellingPrice,
                gst,
                stock,
                barcodeCount
            } = req.body;

            const { userId, role, superAdminId } = req.user;

            
            if (!name || !sellingPrice || !stock) {
                return res.status(400).json({
                    success: false,
                    message: "Name, sellingPrice, and stock are required"
                });
            }

            
            if (!superAdminId) {
                return res.status(403).json({
                    success: false,
                    message: "superAdminId missing in token"
                });
            }

            
            const product = await Product.create({
                name,
                sellingPrice,
                gst,
                stock,

                createdBy: userId,
                roleCreatedBy: role,
                superAdminId: superAdminId
            });

            const count = barcodeCount || stock;

            const barcodes = await generateUniqueBarcodes(count);

            const barcodeDocs = barcodes.map(code => ({
                productId: product._id,
                code,
                isSold: false,
                superAdminId: superAdminId   
            }));

            await Barcode.insertMany(barcodeDocs);

            res.status(201).json({
                success: true,
                message: "Product created successfully",
                product,
                totalBarcodes: barcodes.length,
                barcodes
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



router.get("/",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { page = 1, limit = 10, search = "" } = req.query;
            const { superAdminId } = req.user;

            const query = {
                superAdminId: superAdminId,   
                name: { $regex: search, $options: "i" }
            };

            const products = await Product.find(query)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .sort({ createdAt: -1 });

            const total = await Product.countDocuments(query);

            res.json({
                success: true,
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
                products
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


router.get("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;

            const product = await Product.findOne({
                _id: req.params.id,
                superAdminId: superAdminId  
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            res.json({
                success: true,
                product
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

router.put("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { name, price, gst, stock } = req.body;
            const { superAdminId } = req.user;

            
            const product = await Product.findOne({
                _id: req.params.id,
                superAdminId: superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

           
            if (price !== undefined && (isNaN(price) || price <= 0)) {
                return res.status(400).json({
                    success: false,
                    message: "Price must be a valid number"
                });
            }

            if (gst !== undefined && (isNaN(gst) || gst < 0)) {
                return res.status(400).json({
                    success: false,
                    message: "GST must be a valid number"
                });
            }

            if (stock !== undefined && (isNaN(stock) || stock < 0)) {
                return res.status(400).json({
                    success: false,
                    message: "Stock must be a valid number"
                });
            }

            
            if (name !== undefined) product.name = name;
            if (price !== undefined) product.price = Number(price);
            if (gst !== undefined) product.gst = Number(gst);

            let newBarcodes = [];

            if (stock !== undefined) {
                const newStock = Number(stock);
                const oldStock = product.stock;

                const diff = newStock - oldStock;

                if (diff > 0) {
                    const codes = await generateBarcodes(diff);

                    newBarcodes = codes;

                    const barcodeDocs = codes.map(code => ({
                        productId: product._id,
                        code,
                        isSold: false,
                        superAdminId: superAdminId   
                    }));

                    await Barcode.insertMany(barcodeDocs);
                }

                product.stock = newStock;
            }

            await product.save();

            const barcodes = await Barcode.find({
                productId: product._id
            }).sort({ _id: -1 }).limit(5);

            return res.json({
                success: true,
                message: "Product updated successfully",
                product,
                newBarcodes
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({
                success: false,
                message: "Server error",
                error: err.message
            });
        }
    }
);

router.delete("/:id",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { superAdminId } = req.user;
            const productId = req.params.id;

            
            const product = await Product.findOne({
                _id: productId,
                superAdminId: superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

           
            await Barcode.deleteMany({
                productId: productId,
                superAdminId: superAdminId
            });

            
            await Product.deleteOne({
                _id: productId,
                superAdminId: superAdminId
            });

            res.status(200).json({
                success: true,
                message: "Product and related barcodes deleted successfully"
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