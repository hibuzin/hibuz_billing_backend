const express = require("express");
const router = express.Router();

const Product = require("../models/product");
const Purchase = require("../models/purchase");
const Barcode = require("../models/barcode");
const { attachHierarchy } = require("../utils/hierarchy");

const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const {
    allstockcheck,
    getStockValue,
    getproductsearchstock,
    productStockById,
    lowstockcheck,
    outofstockcheck
} = require("../controllers/stock");

router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    allstockcheck

);


router.get(
    "/stock-value",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getStockValue
);


router.get(
    "/product-search-stock",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getproductsearchstock

);

router.get(
    "/stock/:productId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    productStockById
);

router.get(
    "/low-stock",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    lowstockcheck

);

router.get(
    "/out-of-stock",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    outofstockcheck
);


router.delete(
    "/:barcode",
    verifyToken,
    authorize("super_admin", "admin"),
    async (req, res) => {
        try {
            const hierarchy = attachHierarchy(req.user);
            const { barcode } = req.params;

            const stock = await Barcode.findOne({
                code: barcode,
                superAdminId: hierarchy.superAdminId
            });

            if (!stock) {
                return res.status(404).json({
                    success: false,
                    message: "Stock not found"
                });
            }

            await Product.updateOne(
                {
                    _id: stock.productId,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: {
                        stock: -(Number(stock.availableQty || 0))
                    }
                }
            );

            await Barcode.deleteOne({
                _id: stock._id
            });

            return res.status(200).json({
                success: true,
                message: "Stock deleted successfully"
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


module.exports = router;