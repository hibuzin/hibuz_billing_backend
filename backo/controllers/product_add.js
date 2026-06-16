const mongoose = require("mongoose");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const PriceLevel = require("../models/price_level");
const { attachHierarchy } = require("../utils/hierarchy");
const category = require("../models/category");

const Hsn = require("../models/hsn");


exports.productcreate = async (req, res) => {

    try {
        const {
            name,
            description,
            categoryId,
            hsnCode,
            gstRate,
            mrp,
            costPrice,
            sellingPrice,
            barcode,
            priceLevel
        } = req.body;

        if (!name || !categoryId) {
            return res.status(400).json({
                success: false,
                message: "Name required"
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

        if (!hsnCode) {
            return res.status(400).json({
                success: false,
                message: "HSN code is required"
            });
        }

        const processedGstRate = Number(gstRate || 0);

        const allowedGstRates = [0, 5, 12, 18, 28];

        if (
            isNaN(processedGstRate) ||
            !allowedGstRates.includes(processedGstRate)
        ) {
            return res.status(400).json({
                success: false,
                message: "GST rate must be 0, 5, 12, 18 or 28"
            });
        }

        const processedMrp = Number(mrp);

        if (isNaN(processedMrp) || processedMrp <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid MRP is required"
            });
        }

        const processedCostPrice = Number(costPrice);
        const processedSellingPrice = Number(sellingPrice);

        if (isNaN(processedCostPrice) || processedCostPrice < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid cost price is required"
            });
        }

        if (isNaN(processedSellingPrice) || processedSellingPrice < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid selling price is required"
            });
        }

        if (processedCostPrice > processedMrp) {
            return res.status(400).json({
                success: false,
                message: "Cost price cannot be greater than MRP"
            });
        }

        if (processedSellingPrice > processedMrp) {
            return res.status(400).json({
                success: false,
                message: "Selling price cannot be greater than MRP"
            });
        }

        const product = await Product.create({
            name: String(name).trim(),
           

            description: description
                ? String(description).trim()
                : "",

            stock: 0,
            reservedStock: 0,

            mrp: processedMrp,

            costPrice: processedCostPrice,
            sellingPrice: processedSellingPrice,

            categoryId,
            categoryName: cat.name || "",

            hsnCode: String(hsnCode).trim(),
            gstRate: processedGstRate,

            ...hierarchy,
            createdBy: req.user.userId
        });

        

        let createdBarcode = null;

        if (barcode) {
            const barcodeCode = String(barcode).trim();

            const existingBarcode = await Barcode.findOne({
                code: barcodeCode,
                superAdminId: hierarchy.superAdminId
            });

            if (existingBarcode) {
                return res.status(400).json({
                    success: false,
                    message: "Barcode already exists"
                });
            }

            createdBarcode = await Barcode.create({
                productId: product._id,
                code: barcodeCode,

                qty: 0,
                availableQty: 0,

                mrp: processedMrp,
                costPrice: processedCostPrice,
                sellingPrice: processedSellingPrice,
                gstRate: processedGstRate,

                isSold: false,

                ...hierarchy,
                createdBy: req.user.userId
            });
        }

        let createdPriceLevel = null;

        if (priceLevel) {
            createdPriceLevel = await PriceLevel.findOneAndUpdate(
                {
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    productId: product._id,
                    pricingType: priceLevel.pricingType || "slab",
                    manualPrice: priceLevel.manualPrice || 0,
                    autoPricing: priceLevel.autoPricing || {
                        baseOn: "costPrice",
                        profitPercent: 0
                    },
                    slabs: priceLevel.slabs || [],

                    ...hierarchy,
                    createdBy: req.user.userId,
                    isActive: true
                },
                {
                    upsert: true,
                    new: true,
                    runValidators: true
                }
            );
        }

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: {
                product,
                barcode: createdBarcode,
                priceLevel: createdPriceLevel
            }
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
};


exports.bulkProductCreate = async (req, res) => {
    try {
        const { products } = req.body;

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Products array is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);
        const allowedGstRates = [0, 5, 12, 18, 28];

        const createdProducts = [];
        const errors = [];
        const requestBarcodes = new Set();

        for (let i = 0; i < products.length; i++) {
            try {
                const item = products[i];

                const name = item.name ? String(item.name).trim() : "";
                const brand = item.brand ? String(item.brand).trim() : "";
                const description = item.description ? String(item.description).trim() : "";
                const categoryId = item.categoryId;
                const hsnCode = item.hsnCode ? String(item.hsnCode).trim() : "";
                const barcodeCode = item.barcode ? String(item.barcode).trim() : "";

                const processedGstRate = Number(item.gstRate || 0);
                const processedMrp = Number(item.mrp);
                const processedCostPrice = Number(item.costPrice);
                const processedSellingPrice = Number(item.sellingPrice);


               

                if (!name || !categoryId) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Name and category required"
                    });
                    continue;
                }

                if (!hsnCode) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "HSN code is required"
                    });
                    continue;
                }

                if (isNaN(processedGstRate) || !allowedGstRates.includes(processedGstRate)) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "GST rate must be 0, 5, 12, 18 or 28"
                    });
                    continue;
                }

                if (isNaN(processedMrp) || processedMrp <= 0) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Valid MRP is required"
                    });
                    continue;
                }

                if (isNaN(processedCostPrice) || processedCostPrice < 0) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Valid cost price is required"
                    });
                    continue;
                }

                if (isNaN(processedSellingPrice) || processedSellingPrice < 0) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Valid selling price is required"
                    });
                    continue;
                }

                if (processedCostPrice > processedMrp) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Cost price cannot be greater than MRP"
                    });
                    continue;
                }

                if (processedSellingPrice > processedMrp) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Selling price cannot be greater than MRP"
                    });
                    continue;
                }

                const cat = await category.findOne({
                    _id: categoryId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!cat) {
                    errors.push({
                        row: i + 1,
                        name,
                        barcode: barcodeCode,
                        message: "Category not found"
                    });
                    continue;
                }

                if (barcodeCode) {
                    if (requestBarcodes.has(barcodeCode)) {
                        errors.push({
                            row: i + 1,
                            name,
                            barcode: barcodeCode,
                            message: "Duplicate barcode in request"
                        });
                        continue;
                    }

                    requestBarcodes.add(barcodeCode);

                    const existingBarcode = await Barcode.findOne({
                        code: barcodeCode,
                        superAdminId: hierarchy.superAdminId
                    });

                    if (existingBarcode) {
                        errors.push({
                            row: i + 1,
                            name,
                            barcode: barcodeCode,
                            message: "Barcode already exists in database"
                        });
                        continue;
                    }
                }

                const product = await Product.create({
                    name,
                    brand,
                    description,

                    stock: 0,
                    reservedStock: 0,

                    

                    mrp: processedMrp,
                    costPrice: processedCostPrice,
                    sellingPrice: processedSellingPrice,

                    categoryId,
                    categoryName: cat.name || "",

                    hsnCode,
                    gstRate: processedGstRate,

                    ...hierarchy,
                    createdBy: req.user.userId
                });

                let createdBarcode = null;

                if (barcodeCode) {
                    createdBarcode = await Barcode.create({
                        productId: product._id,
                        code: barcodeCode,

                        qty: 0,
                        availableQty: 0,

                        mrp: processedMrp,
                        costPrice: processedCostPrice,
                        sellingPrice: processedSellingPrice,
                        gstRate: processedGstRate,

                       

                        isSold: false,

                        ...hierarchy,
                        createdBy: req.user.userId
                    });
                }

                let createdPriceLevel = null;

                if (item.priceLevel) {
                    createdPriceLevel = await PriceLevel.findOneAndUpdate(
                        {
                            productId: product._id,
                            superAdminId: hierarchy.superAdminId
                        },
                        {
                            productId: product._id,
                            pricingType: item.priceLevel.pricingType || "slab",
                            manualPrice: item.priceLevel.manualPrice || 0,
                            autoPricing: item.priceLevel.autoPricing || {
                                baseOn: "costPrice",
                                profitPercent: 0
                            },
                            slabs: item.priceLevel.slabs || [],

                            ...hierarchy,
                            createdBy: req.user.userId,
                            isActive: true
                        },
                        {
                            upsert: true,
                            new: true,
                            runValidators: true
                        }
                    );
                }

                createdProducts.push({
                    row: i + 1,
                    product,
                    barcode: createdBarcode,
                    priceLevel: createdPriceLevel
                });

            } catch (err) {
                errors.push({
                    row: i + 1,
                    message: err.code === 11000
                        ? "Duplicate product or barcode"
                        : err.message
                });
            }
        }

        return res.status(201).json({
            success: true,
            message: "Bulk product add completed",
            total: products.length,
            createdCount: createdProducts.length,
            errorCount: errors.length,
            data: createdProducts,
            errors
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getproductMrps = async (req, res) => {
    try {
        const { productId } = req.params;

        const hierarchy = attachHierarchy(req.user);

        

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
};

exports.allProducts = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        let products = await Product.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("categoryId", "name")
            .sort({ createdAt: -1 })
            .lean();

        products = await Promise.all(
            products.map(async (product) => {

                const barcode = await Barcode.findOne({
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId
                }).lean();

                const priceLevel = await PriceLevel.findOne({
                    productId: product._id,
                    superAdminId: hierarchy.superAdminId,
                    isActive: true
                }).lean();

                return {
                    ...product,
                    barcode: barcode?.code || "",
                    barcodeId: barcode?._id || "",
                    availableQty: barcode?.availableQty || 0,

                    priceLevel: priceLevel
                        ? {
                            pricingType: priceLevel.pricingType,
                            manualPrice: priceLevel.manualPrice,
                            autoPricing: priceLevel.autoPricing,
                            slabs: priceLevel.slabs
                        }
                        : null
                };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Products fetched successfully",
            count: products.length,
            data: products
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.searchProducts = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search value is required"
            });
        }

        const products = await Product.find({
            superAdminId: hierarchy.superAdminId,
            isActive: { $ne: false },
            $or: [
                { name: { $regex: search, $options: "i" } },
                { brand: { $regex: search, $options: "i" } },
                { hsnCode: { $regex: search, $options: "i" } }
            ]
        })
            .populate("categoryId", "name hsnCode gstRate")
            .sort({ createdAt: -1 })
            .limit(20);

        const data = products.map((product) => ({
            productId: product._id,
            productName: product.name || "",
            

            stock: Number(product.stock || 0),
            reservedStock: Number(product.reservedStock || 0),

            categoryId: product.categoryId?._id || "",
            categoryName: product.categoryId?.name || "",

            hsnCode: product.hsnCode || product.categoryId?.hsnCode || "",
            gstRate: Number(product.gstRate || product.categoryId?.gstRate || 0),

            costPrice: Number(product.costPrice || 0),
            sellingPrice: Number(product.sellingPrice || 0),

            mrps: product.mrps || [],

            status:
                Number(product.stock || 0) <= 0
                    ? "Out Of Stock"
                    : Number(product.stock || 0) <= 10
                        ? "Low Stock"
                        : "Available"
        }));

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.searchProductsByCategory = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { categoryId } = req.params;
        const { search } = req.query;

        const cat = await category.findOne({
            _id: categoryId,
            superAdminId: hierarchy.superAdminId,
            isActive: true
        });

        if (!cat) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const filter = {
            superAdminId: hierarchy.superAdminId,
            categoryId: cat._id,
            isActive: { $ne: false }
        };

        if (search) {
            const categoryName = String(cat.name || "").toLowerCase();
            const searchValue = String(search || "").toLowerCase();

            if (!categoryName.includes(searchValue)) {
                filter.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { brand: { $regex: search, $options: "i" } },
                    { hsnCode: { $regex: search, $options: "i" } }
                ];
            }
        }

        const products = await Product.find(filter)
            .populate("categoryId", "name hsnCode gstRate")
            .sort({ createdAt: -1 });

        const data = products.map((product) => ({
            productId: product._id,
            productName: product.name || "",
            brand: product.brand || "",
            stock: Number(product.stock || 0),
            reservedStock: Number(product.reservedStock || 0),

            categoryId: product.categoryId?._id || "",
            categoryName: product.categoryId?.name || "",

            hsnCode: product.hsnCode || product.categoryId?.hsnCode || "",
            gstRate: Number(product.gstRate || product.categoryId?.gstRate || 0),

            
            mrps: product.mrps || [],

            status:
                Number(product.stock || 0) <= 0
                    ? "Out Of Stock"
                    : Number(product.stock || 0) <= 10
                        ? "Low Stock"
                        : "Available"
        }));

        return res.status(200).json({
            success: true,
            category: {
                categoryId: cat._id,
                categoryName: cat.name,
                hsnCode: cat.hsnCode,
                gstRate: cat.gstRate
            },
            count: data.length,
            data
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.ProductsById = async (req, res) => {
    try {
        const { id } = req.params;

        const hierarchy = attachHierarchy(req.user);

        const product = await Product.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("categoryId", "name hsnCode gstRate")
            .populate("hsnId", "hsnCode gstRate cgst sgst igst cess")
            .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const barcode = await Barcode.findOne({
            productId: product._id,
            superAdminId: hierarchy.superAdminId
        }).lean();

        const priceLevel = await PriceLevel.findOne({
            productId: product._id,
            superAdminId: hierarchy.superAdminId,
            isActive: true
        }).lean();

        return res.status(200).json({
            success: true,
            data: {
                ...product,
                barcode: barcode?.code || "",
                barcodeId: barcode?._id || "",
                availableQty: barcode?.availableQty || 0,
                priceLevel: priceLevel || null
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            name,
            description,
            categoryId,
            hsnCode,
            gstRate,
            mrp,
            costPrice,
            sellingPrice
        } = req.body;

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
            product.categoryName = cat.name || "";
        }

        if (name) product.name = String(name).trim();

        if (description !== undefined) {
            product.description = String(description).trim();
        }

        if (hsnCode !== undefined) {
            if (!hsnCode) {
                return res.status(400).json({
                    success: false,
                    message: "HSN code is required"
                });
            }

            product.hsnCode = String(hsnCode).trim();
        }

        if (gstRate !== undefined) {
            const processedGstRate = Number(gstRate);

            if (isNaN(processedGstRate) || processedGstRate < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid GST rate is required"
                });
            }

            product.gstRate = processedGstRate;
        }

        if (mrp !== undefined) {
            const processedMrp = Number(mrp);

            if (isNaN(processedMrp) || processedMrp <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid MRP is required"
                });
            }

            product.mrp = processedMrp;
        }

        if (costPrice !== undefined) {
            const processedCostPrice = Number(costPrice);

            if (isNaN(processedCostPrice) || processedCostPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid cost price is required"
                });
            }

            product.costPrice = processedCostPrice;
        }

        if (sellingPrice !== undefined) {
            const processedSellingPrice = Number(sellingPrice);

            if (isNaN(processedSellingPrice) || processedSellingPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid selling price is required"
                });
            }

            product.sellingPrice = processedSellingPrice;
        }

        if (
            product.mrp &&
            product.costPrice !== undefined &&
            product.costPrice > product.mrp
        ) {
            return res.status(400).json({
                success: false,
                message: "Cost price cannot be greater than MRP"
            });
        }

        if (
            product.mrp &&
            product.sellingPrice !== undefined &&
            product.sellingPrice > product.mrp
        ) {
            return res.status(400).json({
                success: false,
                message: "Selling price cannot be greater than MRP"
            });
        }

        product.updatedBy = req.user.userId || req.user.id;

        await product.save();

        return res.json({
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

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.deleteAllProducts = async (req, res) => {

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
};

exports.deleteProduct = async (req, res) => {

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
};