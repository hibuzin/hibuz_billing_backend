const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const {
    createPurchase,
    getPurchases,
    getPurchaseById,
    updatePurchase,
    deleteAllPurchases,
    deletePurchase
} = require("../controllers/Purchase");


router.post(
    "/purchase",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createPurchase
);


router.get(
    "/",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getPurchases

);



router.get(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getPurchaseById

);



router.put(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin"),
    updatePurchase
       
);


router.delete(
    "/delete/all",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    deleteAllPurchases
       
);

router.delete(
    "/:id",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    deletePurchase
);


module.exports = router;