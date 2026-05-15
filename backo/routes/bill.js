const express = require("express");
const router = express.Router();

const Bill = require("../models/Bill");
const Product = require("../models/Product");
const Barcode = require("../models/Barcode");
const Customer = require("../models/Customer");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");

router.post(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    async (req, res) => {
        try {
            const { codes, customerId, redeemPoints = 0 } = req.body;

            if (!Array.isArray(codes) || codes.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No barcodes provided"
                });
            }

            const hierarchy = attachHierarchy(req.user);

            let subTotal = 0;
            let totalGST = 0;
            const items = [];

            for (const code of codes) {
                const barcode = await Barcode.findOne({
                    code: String(code).trim(),
                    isSold: false,
                    superAdminId: hierarchy.superAdminId
                });

                if (!barcode) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid or already sold barcode: ${code}`
                    });
                }

                const product = await Product.findOne({
                    _id: barcode.productId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found"
                    });
                }

                if (product.stock <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `${product.name} out of stock`
                    });
                }

                const price = Number(barcode.sellingPrice || 0);
                const gstRate = Number(barcode.gstRate || product.gstRate || 0);

                if (price <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid selling price for barcode: ${code}`
                    });
                }

                const gstAmount = (price * gstRate) / 100;
                const finalPrice = price + gstAmount;

                subTotal += price;
                totalGST += gstAmount;

                items.push({
                    productId: product._id,
                    barcodeId: barcode._id,
                    barcode: barcode.code,

                    name: product.name,
                    brand: product.brand || "",
                    flavor: barcode.flavor || "",
                    liters: barcode.liters || "",

                    mrp: barcode.mrp,
                    price,
                    gstRate,
                    gstAmount,
                    finalPrice
                });

                barcode.isSold = true;
                await barcode.save();

                await Product.updateOne(
                    {
                        _id: product._id,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            stock: -1
                        }
                    }
                );
            }

            let discount = 0;
            let customer = null;

            if (customerId) {
                customer = await Customer.findOne({
                    customerId,
                    superAdminId: hierarchy.superAdminId
                });

                if (!customer) {
                    return res.status(404).json({
                        success: false,
                        message: "Customer not found"
                    });
                }

                if (Number(redeemPoints) > 0) {
                    if (customer.loyaltyPoints < Number(redeemPoints)) {
                        return res.status(400).json({
                            success: false,
                            message: "Not enough loyalty points"
                        });
                    }

                    discount = Number(redeemPoints);
                    customer.loyaltyPoints -= discount;
                }
            }

            const grandTotal = subTotal + totalGST - discount;
            const earnedPoints = Math.floor(grandTotal / 100);

            if (customer) {
                customer.loyaltyPoints += earnedPoints;
                customer.totalSpent += grandTotal;
                await customer.save();
            }

            const bill = await Bill.create({
                items,

                summary: {
                    subTotal,
                    totalGST,
                    discount,
                    grandTotal
                },

                customerId: customer ? customer._id : null,

                paymentStatus: "paid",

                createdBy: req.user.userId,
                role: req.user.role,

                ...hierarchy
            });

            return res.status(201).json({
                success: true,
                message: "Bill generated successfully",
                data: {
                    billId: bill._id,
                    items,
                    summary: bill.summary,
                    loyalty: {
                        used: discount,
                        earned: earnedPoints,
                        remaining: customer ? customer.loyaltyPoints : 0
                    }
                }
            });

        } catch (error) {
            console.error("BILL ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Server error",
                error: error.message
            });
        }
    }
);



router.get("/sales", verifyToken, authorize("super_admin"), async (req, res) => {
    try {

        const type = req.query.type || "today";
        const now = new Date();
        let startDate = new Date();
        const endDate = now;

        switch (type) {
            case "today":
                startDate.setHours(0, 0, 0, 0);
                break;
            case "week":
                startDate.setDate(now.getDate() - 7);
                break;
            case "month":
                startDate.setMonth(now.getMonth() - 1);
                break;
            case "year":
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate.setHours(0, 0, 0, 0);
        }

        const bills = await Bill.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).lean();


        const totalSales = bills.reduce((sum, bill) => {
            const billTotal = bill.items.reduce((itemSum, item) => {
                const gstAmount = (item.price * item.gst) / 100;
                return itemSum + item.price + gstAmount;
            }, 0);

            return sum + billTotal;
        }, 0);

        return successResponse(res, {
            type,
            totalBills: bills.length,
            totalSalesAmount: parseFloat(totalSales.toFixed(2)),


            bills: bills.map(bill => {
                const billTotal = bill.items.reduce((itemSum, item) => {
                    const gstAmount = (item.price * item.gst) / 100;
                    return itemSum + item.price + gstAmount;
                }, 0);

                return {
                    billId: bill._id,
                    totalAmount: bill.totalAmount,
                    grandTotal: parseFloat(billTotal.toFixed(2)),
                    itemCount: bill.items.length,
                    createdAt: bill.createdAt
                };
            })
        }, "Sales fetched successfully");

    } catch (err) {


        return errorResponse(res, err.message, 500);
    }
});

router.get("/sales/cashier", verifyToken, authorize("super_admin", "admin"), async (req, res) => {
    try {
        const { cashierId, type = "today" } = req.query;

        const now = new Date();
        let startDate = new Date();

        if (type === "today") {
            startDate.setHours(0, 0, 0, 0);
        } else if (type === "week") {
            startDate.setDate(now.getDate() - 7);
        } else if (type === "month") {
            startDate.setMonth(now.getMonth() - 1);
        } else if (type === "year") {
            startDate.setFullYear(now.getFullYear() - 1);
        }

        const matchStage = {};

        if (cashierId) {
            matchStage.createdBy = new mongoose.Types.ObjectId(cashierId);
        }

        const sales = await Bill.aggregate([
            { $match: matchStage },

            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "cashier"
                }
            },
            { $unwind: "$cashier" },

            {
                $match: {
                    "cashier.role": "cashier"
                }
            },

            {
                $group: {
                    _id: "$createdBy",
                    cashierName: { $first: "$cashier.name" },
                    totalBills: { $sum: 1 },
                    totalAmount: { $sum: "$summary.grandTotal" },

                }
            },

            {
                $project: {
                    _id: 0,
                    cashierId: "$_id",
                    cashierName: 1,
                    totalBills: 1,
                    totalAmount: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: sales
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

router.get("/print/:id", async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id)
            .populate("items.productId");
        if (!bill) {
            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }


        let items = [];
        let subTotal = 0;
        let totalGST = 0;

        bill.items.forEach(item => {
            const price = item.price;
            const gst = item.gst;

            const gstAmount = (price * gst) / 100;
            const finalPrice = price + gstAmount;

            items.push({
                productId: item.productId,
                barcodeId: item.barcodeId,
                name: item.name,
                price,
                gst,
                gstAmount,
                finalPrice
            });

            subTotal += price;
            totalGST += gstAmount;
        });

        const grandTotal = subTotal + totalGST;

        return res.status(200).json({
            success: true,
            message: "Print data ready",
            printData: {
                billId: bill._id,
                date: bill.createdAt,

                items,

                summary: {
                    subTotal,
                    totalGST,
                    grandTotal
                }
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});



router.get("/:id", verifyToken, authorize("super_admin", "admin", "cashier"), async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);

        if (!bill) {
            return errorResponse(res, "Bill not found", 404);
        }


        let subTotal = 0;
        let totalGST = 0;

        const items = bill.items.map(item => {
            const gstAmount = (item.price * item.gst) / 100;
            const finalPrice = item.price + gstAmount;

            subTotal += item.price;
            totalGST += gstAmount;

            return {
                name: item.name,
                price: item.price,
                gst: item.gst,
                gstAmount,
                finalPrice
            };
        });

        const grandTotal = subTotal + totalGST;

        return successResponse(res, {
            billId: bill._id,
            items,
            summary: {
                subTotal,
                totalGST,
                grandTotal
            },
            createdAt: bill.createdAt
        }, "Bill fetched successfully");

    } catch (err) {
        return errorResponse(res, "Server error", 500);
    }
});


module.exports = router;