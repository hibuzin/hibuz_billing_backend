const mongoose = require("mongoose");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const { attachHierarchy } = require("../utils/hierarchy");
const category = require("../models/category");
const Hsn = require("../models/hsn");


exports.productcreate = async (req, res) => {

    try {
        const { name, brand, categoryId, flavor, litters, kg, mrps } = req.body;

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



        const processedFlavors = Array.isArray(flavor)
            ? flavor.map(x => String(x).trim()).filter(Boolean)
            : [];

        const processedLitters = Array.isArray(litters)
            ? litters.map(x => String(x).trim()).filter(Boolean)
            : [];

        const processedKg = Array.isArray(kg)
            ? kg.map(x => String(x).trim()).filter(Boolean)
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
            kg: processedKg,
            mrps: processedMrps,

            categoryId,


            hsnId: cat.hsnId || null,
            hsnCode: cat.hsnCode || "",
            gstRate: cat.gstRate || 0,

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
};


exports.getproductMrps = async (req, res) => {
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
};

exports.allProducts = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const products = await Product.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("categoryId", "name")
            .sort({ createdAt: -1 });

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
            brand: product.brand || "",

            stock: Number(product.stock || 0),
            reservedStock: Number(product.reservedStock || 0),

            categoryId: product.categoryId?._id || "",
            categoryName: product.categoryId?.name || "",

            hsnCode: product.hsnCode || product.categoryId?.hsnCode || "",
            gstRate: Number(product.gstRate || product.categoryId?.gstRate || 0),

            flavor: product.flavor || [],
            litters: product.litters || [],
            kg: product.kg || [],
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

            flavor: product.flavor || [],
            litters: product.litters || [],
            kg: product.kg || [],
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
            .populate("hsnId", "hsnCode gstRate cgst sgst igst cess");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: product
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
            product.hsnId = cat.hsnId || null;
            product.hsnCode = cat.hsnCode || "";
            product.gstRate = cat.gstRate || 0;
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

        product.updatedBy = req.user.userId || req.user.id;

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