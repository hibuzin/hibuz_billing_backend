const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const Barcode = require("../models/Barcode");


const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");




router.post(
    "/purchase",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { supplierId, items, invoiceNo, invoiceDate } = req.body;

            if (!supplierId || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier and items are required"
                });
            }

            if (!invoiceNo) {
                return res.status(400).json({
                    success: false,
                    message: "Invoice number is required"
                });
            }

            if (!invoiceDate) {
                return res.status(400).json({
                    success: false,
                    message: "Invoice date is required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const supplier = await Supplier.findOne({
                _id: supplierId,
                superAdminId: hierarchy.superAdminId
            });

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            let totalAmount = 0;
            const processedItems = [];

            for (const item of items) {
                const productId = item.productId;

                const flavor = item.flavor ? String(item.flavor).trim() : "";
                const liters = item.liters ? String(item.liters).trim() : "";
                const mrp = Number(item.mrp);
                const qty = Number(item.qty);
                const costPrice = Number(item.costPrice);
                const sellingPrice = Number(item.sellingPrice || mrp);

                const unitType = item.unitType || "piece";
                const unitValue = Number(item.unitValue || 1);
                const barcode = String(item.barcode || item.code || "").trim();

                if (!productId) {
                    return res.status(400).json({
                        success: false,
                        message: "Product id is required"
                    });
                }

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid quantity"
                    });
                }

                if (isNaN(costPrice) || costPrice < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid cost price"
                    });
                }

                if (isNaN(mrp) || mrp <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid MRP"
                    });
                }

                const product = await Product.findOne({
                    _id: productId,
                    superAdminId: hierarchy.superAdminId
                }).populate("categoryId", "name");

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const gstpercentage = Number(product.gstRate || 0);
                const gst = (qty * costPrice * gstpercentage) / 100;


                const productMrps = Array.isArray(product.mrps) ? product.mrps : [];
                const productFlavors = Array.isArray(product.flavor) ? product.flavor : [];
                const productLiters = Array.isArray(product.liters) ? product.liters : [];

                if (!productMrps.includes(mrp)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected MRP not found in product"
                    });
                }

                if (flavor && !productFlavors.includes(flavor)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected flavor not found in product"
                    });
                }

                if (liters && !productLiters.includes(liters)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected liters not found in product"
                    });
                }

                if (barcode) {
                    await Barcode.findOneAndUpdate(
                        {
                            code: barcode,
                            superAdminId: hierarchy.superAdminId
                        },
                        {
                            productId: product._id,
                            code: barcode,

                            mrp,
                            sellingPrice,
                            costPrice,
                            gstRate: gstpercentage,

                            flavor,
                            liters,

                            isSold: false,

                            ...hierarchy,
                            createdBy: req.user.userId
                        },
                        {
                            upsert: true,
                            new: true
                        }
                    );
                
            }

            totalAmount += (qty * costPrice) + gst;

            processedItems.push({
                productId: product._id,

                hsnId: product.hsnId || null,
                hsnCode: product.hsnCode || "",
                gstpercentage: gstpercentage,
                gst,

                categoryId: product.categoryId?._id,
                categoryName: product.categoryId?.name || "",
                brand: product.brand || "",
                flavor,
                liters,
                qty,
                costPrice,
                mrp,
                sellingPrice,
                unitType,
                unitValue,
                barcode,
                receivedQty: 0,
                pendingQty: qty
            });
        }

            const purchase = await Purchase.create({
            supplierId,
            invoiceNo,
            invoiceDate,
            items: processedItems,
            totalAmount,
            ...hierarchy,
            createdBy: req.user.userId
        });

        res.status(201).json({
            success: true,
            message: "Purchase created successfully",
            data: purchase
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

            const purchases = await Purchase.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("supplierId", "name phone email")
                .populate("items.productId", "name brand")
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                count: purchases.length,
                data: purchases
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
                    message: "Invalid purchase id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const purchase = await Purchase.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            })
                .populate("supplierId", "name phone email")
                .populate("items.productId", "name brand");

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            res.json({
                success: true,
                data: purchase
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
            const { supplierId, items } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid purchase id"
                });
            }

            if (!supplierId || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier and items are required"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const purchase = await Purchase.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            const supplier = await Supplier.findOne({
                _id: supplierId,
                superAdminId: hierarchy.superAdminId
            });

            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found"
                });
            }

            let totalAmount = 0;
            const processedItems = [];

            for (const item of items) {
                const productId = item.productId;

                const flavor = item.flavor ? String(item.flavor).trim() : "";
                const liters = item.liters ? String(item.liters).trim() : "";
                const mrp = Number(item.mrp);

                const qty = Number(item.qty);
                const costPrice = Number(item.costPrice);
                const sellingPrice = Number(item.sellingPrice || mrp);
                const gst = Number(item.gst || 0);

                const unitType = item.unitType || "piece";
                const unitValue = Number(item.unitValue || 1);
                const barcode = String(item.barcode || item.code || "").trim();

                if (!productId) {
                    return res.status(400).json({
                        success: false,
                        message: "Product id is required"
                    });
                }

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid quantity"
                    });
                }

                if (isNaN(costPrice) || costPrice < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid cost price"
                    });
                }

                if (isNaN(mrp) || mrp <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid MRP"
                    });
                }

                const product = await Product.findOne({
                    _id: productId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const productMrps = Array.isArray(product.mrps) ? product.mrps : [];
                const productFlavors = Array.isArray(product.flavor) ? product.flavor : [];
                const productLiters = Array.isArray(product.liters) ? product.liters : [];

                if (!productMrps.includes(mrp)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected MRP not found in product"
                    });
                }

                if (flavor && !productFlavors.includes(flavor)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected flavor not found in product"
                    });
                }

                if (liters && !productLiters.includes(liters)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected liters not found in product"
                    });
                }

                if (barcode) {
                    const exists = await Barcode.findOne({
                        code: barcode,
                        productId: product._id,
                        superAdminId: hierarchy.superAdminId
                    });

                    if (!exists) {
                        await Barcode.create({
                            productId: product._id,
                            code: barcode,
                            isSold: false,
                            superAdminId: hierarchy.superAdminId
                        });
                    }
                }

                totalAmount += qty * costPrice;

                processedItems.push({
                    productId: product._id,
                    brand: product.brand || "",
                    flavor,
                    liters,
                    qty,
                    costPrice,
                    mrp,
                    sellingPrice,
                    gst,
                    unitType,
                    unitValue,
                    barcode,
                    receivedQty: item.receivedQty || 0,
                    pendingQty: qty - Number(item.receivedQty || 0)
                });
            }

            purchase.supplierId = supplierId;
            purchase.items = processedItems;
            purchase.totalAmount = totalAmount;
            purchase.updatedBy = req.user.userId;

            await purchase.save();

            res.json({
                success: true,
                message: "Purchase updated successfully",
                data: purchase
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
    "/delete/all",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {

            const hierarchy = attachHierarchy(req.user);

            const result = await Purchase.deleteMany({
                superAdminId: hierarchy.superAdminId
            });

            res.json({
                success: true,
                message: "All purchases deleted successfully",
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
                    message: "Invalid purchase id"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            const purchase = await Purchase.findOneAndDelete({
                _id: id,
                superAdminId: hierarchy.superAdminId
            });

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            res.json({
                success: true,
                message: "Purchase deleted successfully"
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