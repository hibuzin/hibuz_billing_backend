const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middleware/auth");
const authorize = require("../middleware/role");


const {
    createPurchase,
    getSupplierBalanceBills,
    quickSearchPurchases,
    getPurchases,
    getAllSupplierBalances,
    getPurchaseById,
    updateSupplierBill,
    updatePurchase,
    deleteAllPurchases,
    deletePurchase
} = require("../controllers/purchase");


router.post(
    "/purchase",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    createPurchase
);


router.get(
    "/search",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    quickSearchPurchases
);


router.get(
    "/supplier-balances",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getAllSupplierBalances
);


router.get(
    "/supplier-balance/:supplierId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    getSupplierBalanceBills
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


router.put(
    "/pay/:purchaseId",
    verifyToken,
    authorize("super_admin", "admin", "cashier"),
    updateSupplierBill
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