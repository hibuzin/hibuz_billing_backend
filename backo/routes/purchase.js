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
                const litters = item.litters ? String(item.litters).trim() : "";
                const mrp = Number(item.mrp);
                const qty = Number(item.qty);
                const costPrice = Number(item.costPrice);
                const sellingPrice = Number(item.sellingPrice || mrp);

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
                const productLitters = Array.isArray(product.litters) ? product.litters : [];

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

                if (litters && !productLitters.includes(litters)) {
                    return res.status(400).json({
                        success: false,
                        message: "Selected litters not found in product"
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

                            qty: qty,
                            availableQty: qty,

                            flavor,
                            litters,

                            isSold: false,

                            ...hierarchy,
                            createdBy: req.user.userId
                        },
                        {
                            upsert: true,
                            returnDocument: "after"
                        }
                    );
                }

                await Product.updateOne(
                    {
                        _id: product._id,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            stock: qty
                        }
                    }
                );


                totalAmount += (qty * costPrice) + gst;

                processedItems.push({
                    productId: product._id,

                    hsnId: product.hsnId || null,
                    hsnCode: product.hsnCode || "",
                    gstpercentage,
                    gst,

                    categoryId: product.categoryId?._id,
                    categoryName: product.categoryId?.name || "",
                    brand: product.brand || "",

                    flavor,
                    litters,
                    qty,
                    costPrice,
                    mrp,
                    sellingPrice,
                    barcode,

                    receivedQty: 0,
                    pendingQty: qty
                });
            }

            const purchase = await Purchase.create({
                supplierId,
                supplierName: supplier.supplierName || "",
                supplierEmail: supplier.email || "",
                invoiceNo,
                invoiceDate,
                items: processedItems,
                totalAmount,
                ...hierarchy,
                createdBy: req.user.userId
            });

            const responsePurchase = await Purchase.findById(purchase._id)
                .populate("items.productId", "name brand");

            return res.status(201).json({
                success: true,
                message: "Purchase created successfully",

                data: {
                    _id: responsePurchase._id,

                    supplier: {
                        id: String(supplier._id),

                        name: String(supplier.supplierName || ""),

                        mobile: String(supplier.mobile || ""),

                        email: String(supplier.email || "")
                    },

                    invoiceNo: responsePurchase.invoiceNo,

                    invoiceDate: responsePurchase.invoiceDate,

                    totalAmount: responsePurchase.totalAmount,

                    items: responsePurchase.items.map((item) => ({
                        _id: item._id,

                        productId: item.productId?._id,

                        productName: item.productId?.name || "",

                        brand:
                            item.productId?.brand ||
                            item.brand ||
                            "",

                        hsnCode: item.hsnCode || "",

                        gstpercentage:
                            item.gstpercentage || 0,

                        categoryName:
                            item.categoryName || "",

                        flavor:
                            item.flavor || "",

                        litters:
                            item.litters || "",

                        qty:
                            item.qty || 0,

                        costPrice:
                            item.costPrice || 0,

                        mrp:
                            item.mrp || 0,

                        sellingPrice:
                            item.sellingPrice || 0,

                        gst:
                            item.gst || 0,

                        barcode:
                            item.barcode || "",

                        receivedQty:
                            item.receivedQty || 0,

                        pendingQty:
                            item.pendingQty || 0
                    }))
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

            const purchases = await Purchase.find({
                superAdminId: hierarchy.superAdminId
            })
                .populate("supplierId", "supplierName mobile email")
                .populate("items.productId", "name brand")
                .sort({ createdAt: -1 });

            const formatted = purchases.map((purchase) => ({
                _id: purchase._id,

                supplier: {
                    id: purchase.supplierId?._id || "",
                    name: purchase.supplierId?.supplierName || "",
                    mobile: purchase.supplierId?.mobile || "",
                    email: purchase.supplierId?.email || ""
                },

                invoiceNo: purchase.invoiceNo,
                invoiceDate: purchase.invoiceDate,
                totalAmount: purchase.totalAmount,

                items: purchase.items.map((item) => ({
                    _id: item._id,

                    productId: item.productId?._id || "",
                    productName: item.productId?.name || "",

                    brand:
                        item.productId?.brand ||
                        item.brand ||
                        "",

                    hsnCode: item.hsnCode || "",

                    gstpercentage:
                        item.gstpercentage || 0,

                    categoryName:
                        item.categoryName || "",

                    flavor: item.flavor || "",
                    litters: item.litters || "",

                    qty: item.qty || 0,

                    costPrice:
                        item.costPrice || 0,

                    mrp: item.mrp || 0,

                    sellingPrice:
                        item.sellingPrice || 0,

                    gst: item.gst || 0,

                    barcode:
                        item.barcode || "",

                    receivedQty:
                        item.receivedQty || 0,

                    pendingQty:
                        item.pendingQty || 0
                }))
            }));

            return res.status(200).json({
                success: true,
                count: formatted.length,
                data: formatted
            });

        } catch (err) {
            return res.status(500).json({
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

            const hierarchy = attachHierarchy(req.user);

            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid purchase id"
                });
            }

            const purchase = await Purchase.findOne({
                _id: id,
                superAdminId: hierarchy.superAdminId
            })
                .populate("supplierId", "supplierName mobile email")
                .populate("items.productId", "name brand");

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Purchase not found"
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    _id: purchase._id,

                    supplier: {
                        id: purchase.supplierId?._id || "",
                        name: purchase.supplierId?.supplierName || "",
                        mobile: purchase.supplierId?.mobile || "",
                        email: purchase.supplierId?.email || ""
                    },

                    invoiceNo: purchase.invoiceNo,
                    invoiceDate: purchase.invoiceDate,
                    totalAmount: purchase.totalAmount,

                    items: purchase.items.map((item) => ({
                        _id: item._id,

                        productId: item.productId?._id || "",

                        productName:
                            item.productId?.name || "",

                        brand:
                            item.productId?.brand ||
                            item.brand ||
                            "",

                        hsnCode:
                            item.hsnCode || "",

                        gstpercentage:
                            item.gstpercentage || 0,

                        categoryName:
                            item.categoryName || "",

                        flavor:
                            item.flavor || "",

                        litters:
                            item.litters || "",

                        qty:
                            item.qty || 0,

                        costPrice:
                            item.costPrice || 0,

                        mrp:
                            item.mrp || 0,

                        sellingPrice:
                            item.sellingPrice || 0,

                        gst:
                            item.gst || 0,

                        barcode:
                            item.barcode || "",

                        receivedQty:
                            item.receivedQty || 0,

                        pendingQty:
                            item.pendingQty || 0
                    }))
                }
            });

        } catch (err) {
            return res.status(500).json({
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

            const hierarchy = attachHierarchy(req.user);

            const { id } = req.params;

            const {
                supplierId,
                invoiceNo,
                invoiceDate,
                items
            } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid purchase id"
                });
            }

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

           
            for (const oldItem of purchase.items) {

                await Product.updateOne(
                    {
                        _id: oldItem.productId,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            stock: -oldItem.qty
                        }
                    }
                );
            }

            let processedItems = [];
            let totalAmount = 0;

           
            for (const item of items) {

                const product = await Product.findOne({
                    _id: item.productId,
                    superAdminId: hierarchy.superAdminId
                }).populate("categoryId", "name");

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                const qty = Number(item.qty);
                const costPrice = Number(item.costPrice);
                const mrp = Number(item.mrp);
                const sellingPrice =
                    Number(item.sellingPrice || mrp);

                const gstpercentage =
                    Number(product.gstRate || 0);

                const gst =
                    (qty * costPrice * gstpercentage) / 100;

                
                await Product.updateOne(
                    {
                        _id: product._id,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            stock: qty
                        }
                    }
                );

                totalAmount +=
                    (qty * costPrice) + gst;

                processedItems.push({

                    productId: product._id,

                    hsnId: product.hsnId || null,

                    hsnCode:
                        product.hsnCode || "",

                    gstpercentage,
                    gst,

                    categoryId:
                        product.categoryId?._id,

                    categoryName:
                        product.categoryId?.name || "",

                    brand:
                        product.brand || "",

                    flavor:
                        item.flavor || "",

                    litters:
                        item.litters || "",

                    qty,
                    costPrice,
                    mrp,
                    sellingPrice,

                    barcode:
                        item.barcode || "",

                    receivedQty:
                        item.receivedQty || 0,

                    pendingQty:
                        item.pendingQty || qty
                });
            }

           
            let supplierData = {};

            if (supplierId) {

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

                supplierData = {
                    supplierId: supplier._id,
                    supplierName:
                        supplier.supplierName || "",

                    supplierEmail:
                        supplier.email || ""
                };
            }

           
            purchase.invoiceNo =
                invoiceNo || purchase.invoiceNo;

            purchase.invoiceDate =
                invoiceDate || purchase.invoiceDate;

            purchase.items = processedItems;

            purchase.totalAmount = totalAmount;

            Object.assign(purchase, supplierData);

            await purchase.save();

            const updatedPurchase =
                await Purchase.findById(purchase._id)
                    .populate(
                        "items.productId",
                        "name brand"
                    );

            return res.status(200).json({
                success: true,
                message: "Purchase updated successfully",
                data: updatedPurchase
            });

        } catch (err) {

            return res.status(500).json({
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