
const mongoose = require("mongoose");
const Bill = require("../models/bill");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const SalesReturn = require("../models/sales_return");
const Counter = require("../models/counter");
const CashRegister = require("../models/cashregister");
const { attachHierarchy } = require("../utils/hierarchy");

const getNextSalesReturnNo = async (superAdminId) => {
    const result = await Counter.findOneAndUpdate(
        { name: `sales_return_${superAdminId}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
    );

    return `SR-${String(result.seq).padStart(5, "0")}`;
};

exports.createSalesReturn = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const {
            invoiceNo,
            items,
            refundMethod = "cash",
            reason = ""
        } = req.body;

        if (!invoiceNo) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "Invoice no is required"
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "Return items required"
            });
        }

        const allowedRefundMethods = ["cash", "upi", "card", "adjust"];

        if (!allowedRefundMethods.includes(refundMethod)) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "Refund method must be cash, upi, card or adjust"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const bill = await Bill.findOne({
            invoiceNo,
            superAdminId: hierarchy.superAdminId
        }).session(session);

        if (!bill) {
            await session.abortTransaction();
            session.endSession();

            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }

        const returnNo = await getNextSalesReturnNo(hierarchy.superAdminId);

        let totalReturnAmount = 0;
        let totalGST = 0;
        const returnItems = [];

        for (const item of items) {
            const { productId, barcode, returnQty } = item;

            const qty = Number(returnQty);

            if (!productId || isNaN(qty) || qty <= 0) {
                await session.abortTransaction();
                session.endSession();

                return res.status(400).json({
                    success: false,
                    message: "Valid productId and returnQty required"
                });
            }

            const soldItem = bill.items.find((bi) => {
                const sameProduct =
                    bi.productId?.toString() === productId.toString();

                const sameBarcode = barcode
                    ? bi.barcode === barcode
                    : true;

                return sameProduct && sameBarcode;
            });

            if (!soldItem) {
                await session.abortTransaction();
                session.endSession();

                return res.status(400).json({
                    success: false,
                    message: "Product not found in this bill"
                });
            }

            const alreadyReturnedQty = Number(soldItem.returnedQty || 0);
            const availableReturnQty = Number(soldItem.qty || 0) - alreadyReturnedQty;

            if (qty > availableReturnQty) {
                await session.abortTransaction();
                session.endSession();

                return res.status(400).json({
                    success: false,
                    message: `Return qty exceeded. Available return qty: ${availableReturnQty}`
                });
            }

            const unitFinalPrice =
                Number(soldItem.finalPrice || 0) / Number(soldItem.qty || 1);

            const returnAmount = Number((unitFinalPrice * qty).toFixed(2));

            const gstRate = Number(soldItem.gstRate || 0);
            const taxableAmount = Number((returnAmount / (1 + gstRate / 100)).toFixed(2));
            const gstAmount = Number((returnAmount - taxableAmount).toFixed(2));

            totalReturnAmount += returnAmount;
            totalGST += gstAmount;

            await Barcode.updateOne(
                {
                    _id: soldItem.barcodeId,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        availableQty: qty
                    }
                },
                { session }
            );

            await Product.updateOne(
                {
                    _id: soldItem.productId,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: qty
                    }
                },
                { session }
            );

            soldItem.returnedQty = alreadyReturnedQty + qty;

            returnItems.push({
                productId: soldItem.productId,
                barcodeId: soldItem.barcodeId,
                barcode: soldItem.barcode,
                productName: soldItem.productName || soldItem.name || "",
                soldQty: soldItem.qty,
                returnQty: qty,
                sellingPrice: soldItem.sellingPrice || soldItem.normalSellingPrice || 0,
                gstRate,
                gstAmount,
                returnAmount
            });
        }

        await bill.save({ session });

        totalReturnAmount = Number(totalReturnAmount.toFixed(2));
        totalGST = Number(totalGST.toFixed(2));

        const salesReturn = await SalesReturn.create([{
            returnNo,
            billId: bill._id,
            invoiceNo: bill.invoiceNo,
            customerId: bill.customerId || null,
            items: returnItems,
            totalReturnAmount,
            totalGST,
            refundMethod,
            reason,
            createdBy: req.user.userId || req.user.id,
            ...hierarchy
        }], { session });

        if (refundMethod === "cash") {
            const cashRegister = await CashRegister.findOne({
                superAdminId: hierarchy.superAdminId,
                status: "open"
            }).session(session);

            if (cashRegister) {
                cashRegister.cashOut += totalReturnAmount;

                cashRegister.expectedCash =
                    cashRegister.openingAmount +
                    cashRegister.cashSales -
                    cashRegister.cashOut;

                await cashRegister.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: "Sales return created successfully",
            data: {
                returnId: salesReturn[0]._id,
                returnNo,
                invoiceNo: bill.invoiceNo,
                refundMethod,
                items: returnItems,
                summary: {
                    totalReturnAmount,
                    totalGST,
                    cgst: Number((totalGST / 2).toFixed(2)),
                    sgst: Number((totalGST / 2).toFixed(2))
                }
            }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("SALES RETURN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.getSalesReturns = async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);

        const salesReturns = await SalesReturn.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "customerId name phone")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: salesReturns.length,
            data: salesReturns
        });

    } catch (error) {
        console.error("GET SALES RETURNS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.getSalesReturnById = async (req, res) => {
    try {

        const { id } = req.params;

        const hierarchy = attachHierarchy(req.user);

        const salesReturn = await SalesReturn.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "customerId name phone");

        if (!salesReturn) {
            return res.status(404).json({
                success: false,
                message: "Sales return not found"
            });
        }

        res.json({
            success: true,
            data: salesReturn
        });

    } catch (error) {
        console.error("GET SALES RETURN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};