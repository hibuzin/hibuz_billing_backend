const ProductPriceHistory = require("../models/productPriceHistory");
const mongoose = require("mongoose");

exports.getProductPriceHistory = async (req, res) => {
    try {
        const { productId } = req.params;
        const { fromDate, toDate, barcode } = req.query;

        const hierarchy = attachHierarchy(req.user);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product id"
            });
        }

        const match = {
            productId: new mongoose.Types.ObjectId(productId),
            superAdminId: hierarchy.superAdminId
        };

        if (barcode) {
            match.barcode = String(barcode).trim();
        }

        if (fromDate && toDate) {
            match.createdAt = {
                $gte: new Date(fromDate),
                $lte: new Date(toDate)
            };
        }

        const history = await ProductPriceHistory.find(match)
            .populate("createdBy", "name email CompanyName CompanyEmail")
            .populate("purchaseId", "invoiceNo invoiceDate")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: history.length,
            data: history.map((item) => ({
                _id: item._id,
                productId: item.productId,
                barcode: item.barcode,

                oldMrp: item.oldMrp,
                newMrp: item.newMrp,

                oldCostPrice: item.oldCostPrice,
                newCostPrice: item.newCostPrice,

                oldSellingPrice: item.oldSellingPrice,
                newSellingPrice: item.newSellingPrice,

                source: item.source,
                invoiceNo: item.invoiceNo,
                purchaseId: item.purchaseId?._id || null,

                changedBy: item.createdBy || null,
                createdAt: item.createdAt
            }))
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};