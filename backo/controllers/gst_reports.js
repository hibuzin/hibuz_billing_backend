const mongoose = require("mongoose");
const Bill = require("../models/bill");
const Purchase = require("../models/purchase");
const authorize = require("../middleware/role");
const { attachHierarchy } = require("../utils/hierarchy");




exports.getsalesSummary = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { fromDate, toDate } = req.query;

        const filter = {
            superAdminId: hierarchy.superAdminId
        };

        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const bills = await Bill.find(filter);

        let totalSales = 0;
        let taxableAmount = 0;
        let cgst = 0;
        let sgst = 0;
        let igst = 0;

        bills.forEach((bill) => {
            const summary = bill.summary || {};

            totalSales += Number(bill.totalAmount || summary.grandTotal || 0);
            taxableAmount += Number(bill.taxableAmount || summary.subTotal || 0);
            cgst += Number(bill.cgst || 0);
            sgst += Number(bill.sgst || 0);
            igst += Number(bill.igst || 0);


            if (!bill.cgst && !bill.sgst && summary.totalGST) {
                cgst += Number(summary.totalGST || 0) / 2;
                sgst += Number(summary.totalGST || 0) / 2;
            }
        });


        res.json({
            success: true,
            data: {
                totalBills: bills.length,
                totalSales,
                taxableAmount,
                cgst,
                sgst,
                igst,
                totalTax: cgst + sgst + igst
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


exports.getpurchaseSummary = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { fromDate, toDate } = req.query;

        const filter = {
            superAdminId: hierarchy.superAdminId
        };

        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const purchases = await Purchase.find(filter);

        let totalPurchase = 0;
        let inputGST = 0;

        purchases.forEach((purchase) => {
            totalPurchase += purchase.totalAmount || 0;

            purchase.items.forEach((item) => {
                const gstAmount = Number(item.gst || 0);
                inputGST += gstAmount;
            });
        });

        res.json({
            success: true,
            data: {
                totalPurchases: purchases.length,
                totalPurchase,
                inputGST
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

exports.getrateWiseSales = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { fromDate, toDate } = req.query;

        const filter = {
            superAdminId: hierarchy.superAdminId
        };

        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        const bills = await Bill.find(filter);

        const summary = {};

        bills.forEach((bill) => {
            bill.items.forEach((item) => {
                const gstRate = Number(item.gst || 0);
                const qty = Number(item.qty || 1);
                const price = Number(item.price || item.sellingPrice || 0);

                const taxable = qty * price;
                const tax = (taxable * gstRate) / 100;

                if (!summary[gstRate]) {
                    summary[gstRate] = {
                        gstRate,
                        taxableAmount: 0,
                        taxAmount: 0
                    };
                }

                summary[gstRate].taxableAmount += taxable;
                summary[gstRate].taxAmount += tax;
            });
        });

        res.json({
            success: true,
            data: Object.values(summary)
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
}

exports.getpurchaseregister = async (req, res) => {
    try {

        const hierarchy = attachHierarchy(req.user);
        const { fromDate, toDate, invoiceNo, period } = req.query;

        const filter = {
            superAdminId: hierarchy.superAdminId
        };

        const parseDate = (dateStr, endOfDay = false) => {

            const [day, month, year] = dateStr.split("-");

            if (endOfDay) {
                return new Date(year, month - 1, day, 23, 59, 59);
            }

            return new Date(year, month - 1, day);
        };

        if (fromDate || toDate) {

            filter.createdAt = {};

            if (fromDate) {
                filter.createdAt.$gte = parseDate(fromDate);
            }

            if (toDate) {
                filter.createdAt.$lte = parseDate(toDate, true);
            }
        }


        if (invoiceNo && invoiceNo.trim() !== "") {
            filter.$or = [
                { invoiceNo: { $regex: invoiceNo.trim(), $options: "i" } },
                { purchaseNumber: { $regex: invoiceNo.trim(), $options: "i" } }
            ];
        }

        const purchases = await Purchase.find(filter)
            .populate("supplierId", "supplierName gstin")
            .sort({ createdAt: -1 });

        const data = purchases.map((purchase, index) => {

            const gstSummary = {
                0: 0,
                5: 0,
                12: 0,
                18: 0,
                28: 0
            };

            let goodsAmount = 0;

            purchase.items.forEach((item) => {

                const qty = Number(item.qty || 0);
                const price = Number(item.costPrice || 0);
                const gst = Number(item.gstpercentage || 0);

                const taxable = qty * price;

                goodsAmount += taxable;

                if (gstSummary[gst] !== undefined) {
                    gstSummary[gst] += taxable;
                }
            });

            return {
                sno: index + 1,

                date: purchase.createdAt,

                invoiceNo:
                    purchase.purchaseNumber ||
                    purchase.invoiceNo ||
                    purchase._id,

                invoiceDate:
                    purchase.invoiceDate ||
                    purchase.createdAt,

                distributor:
                    purchase.supplierId?.name || "",

                gstin:
                    purchase.supplierId?.gstin || "",

                goodsAmount,

                gst0: gstSummary[0],

                gst5: gstSummary[5],

                gst12: gstSummary[12],

                gst18: gstSummary[18],

                gst28: gstSummary[28]
            };
        });

        res.json({
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