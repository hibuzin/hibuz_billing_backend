const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Barcode = require("../models/Barcode");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
};

router.post("/add",verifyToken,authorize("super_admin", "admin", "cashier"),async (req, res) => {
        try {
            const { name, code, costPrice, sellingPrice } = req.body;
            const { userId, role, superAdminId } = req.user;

            
            if (!name || !code || !sellingPrice) {
                return res.status(400).json({
                    success: false,
                    message: "Name, barcode and sellingPrice required"
                });
            }

            const exists = await Barcode.findOne({
                code,
                superAdminId: superAdminId
            });

            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: "Barcode already exists"
                });
            }

            const product = await Product.create({
                name,
                costPrice,
                sellingPrice,
                stock: 1,

               
                createdBy: userId,
                roleCreatedBy: role,
                superAdminId: superAdminId
            });

            await Barcode.create({
                productId: product._id,
                code,
                isSold: false,
                superAdminId: superAdminId
            });

            res.status(201).json({
                success: true,
                message: "Product with barcode created",
                data: product
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