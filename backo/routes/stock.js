const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Purchase = require("../models/purchase");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");



router.get(
    "/stock-check",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);

            const purchases = await Purchase.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("supplierId", "supplierName mobile email")
                .populate("items.productId", "name brand stock")
                .sort({ createdAt: -1 });

            const data = [];

            purchases.forEach((purchase) => {
                purchase.items.forEach((item) => {
                    const currentStock = Number(item.productId?.stock || 0);
                    const purchaseQty = Number(item.qty || 0);

                    data.push({
                        productId: item.productId?._id || item.productId,
                        productName: item.productId?.name || "",
                        brand: item.productId?.brand || item.brand || "",

                        currentStock,
                        mrp: item.mrp,
                        flavor: item.flavor || "",
                        litters: item.litters || "",


                        status:
                            currentStock <= 0
                                ? "Out Of Stock"
                                : currentStock <= 10
                                    ? "Low Stock"
                                    : "Available"
                    });
                });
            });

            res.status(200).json({
                success: true,
                count: data.length,
                data
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
    "/product-search-stock",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);
            const { search } = req.query;

            if (!search || search.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message: "Search is required"
                });
            }

            const purchases = await Purchase.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("items.productId", "name brand stock")
                .sort({ createdAt: -1 });

            const data = [];

            purchases.forEach((purchase) => {
                purchase.items.forEach((item) => {
                    const productName = item.productId?.name || "";
                    const brand = item.productId?.brand || item.brand || "";

                    const matched =
                        productName.toLowerCase().includes(search.toLowerCase()) ||
                        brand.toLowerCase().includes(search.toLowerCase());

                    if (matched) {
                        data.push({
                            productId: item.productId?._id || item.productId,
                            productName,
                            brand,
                            mrp: item.mrp,
                            flavor: item.flavor || "",
                            litters: item.litters || "",

                            currentStock: Number(item.productId?.stock || 0)
                        });
                    }
                });
            });

            res.status(200).json({
                success: true,
                count: data.length,
                data
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
    "/low-stock",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);
            const limit = Number(req.query.limit || 10);

            const products = await Product.find({
                superAdminId: hierarchy.superAdminId,
                stock: { $gt: 0, $lte: limit }
            })
                .populate("categoryId", "name")
                .sort({ stock: 1 });

            const data = products.map((product, index) => ({
                sno: index + 1,
                productId: product._id,
                productName: product.name,
                brand: product.brand || "",
                category: product.categoryId?.name || "",
                currentStock: Number(product.stock || 0),
                mrps: product.mrps || [],
                flavors: product.flavor || [],
                liters: product.liters || [],
                gstRate: Number(product.gstRate || 0),
                status: "Low Stock"
            }));

            res.status(200).json({
                success: true,
                limit,
                count: data.length,
                data
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