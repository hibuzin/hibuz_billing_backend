const express = require("express");
const multer = require("multer");
const path = require("path");
const { scanPurchaseBill, scanAndParsePurchaseBill } = require("../controllers/ocr");

const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + "-" + Math.round(Math.random() * 1E9) + ext);
    }
});

const upload = multer({ storage });

router.post("/scan-purchase-bill", upload.single("billImage"), scanPurchaseBill);
router.post("/scan-and-parse-purchase-bill", scanAndParsePurchaseBill);

module.exports = router;