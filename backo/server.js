const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cors = require("cors");
const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const authRoutes = require("./routes/auth");
const superAdminControlRoutes = require("./routes/superAdminControl");
const AdminUserRoutes = require("./routes/AdminUser");
const superAdminProfileRoutes = require("./routes/superAdminProfile");
const cashierRoutes = require("./routes/cashier");
const adminRoutes = require("./routes/admin");
const productsRoutes = require("./routes/products");
const productaddRoutes = require("./routes/productadd")
const scanRoutes = require("./routes/scan");
const billRoutes = require("./routes/bill");
const customerRoutes = require("./routes/customer");
const purchaseRoutes = require("./routes/purchase");
const supplierRoutes = require("./routes/supplier");
const categoryRoutes = require("./routes/category");
const loyaltyRoutes = require("./routes/loyalty");
const DamageRoutes = require("./routes/Damage");
const GRNRoutes = require("./routes/GRN");
const returnRoutes = require("./routes/return");
const reorderRoutes = require("./routes/reorder");
const barcodePrintRoutes = require("./routes/barcodePrint");
const StockRebillingRoutes = require("./routes/StockRebilling");
const salesInvoiceRoutes = require("./routes/salesInvoice");
const salesReturnRoutes = require("./routes/salesReturn");
const salesReturnRequestRoutes = require("./routes/salesReturnRequest");
const holdBillRoutes = require("./routes/holdBill");
const auditLogRoutes = require("./routes/auditLogs");
const stockLedgerRoutes = require("./routes/stockLedger");
const gstReportsRoutes = require("./routes/gstReports");
const gstReturnsRoutes = require("./routes/gstReturns");
const annexureReportsRoutes = require("./routes/annexureReports");
const stockRoutes = require("./routes/stock");
const brandRoutes = require("./routes/brand");
const attributeRoutes = require("./routes/attribute");
const locationRoutes = require("./routes/location");
const hsnRoutes = require("./routes/hsn");
const priceLevelRoutes = require("./routes/priceLevel");
const duePaymentRoutes = require("./routes/duePayment");
const sessionRoutes = require("./routes/session");





app.use("/api/auth", authRoutes);
app.use("/api/super-admin", superAdminControlRoutes);
app.use("/api/admin", AdminUserRoutes);
app.use("/api/superadmin", superAdminProfileRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/productadd", productaddRoutes);
app.use("/api/supplier", supplierRoutes);
app.use("/api/scan", scanRoutes);
app.use("/api/bill", billRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/damage", DamageRoutes);
app.use("/api/grn", GRNRoutes);
app.use("/api/return", returnRoutes);
app.use("/api/reorder", reorderRoutes);
app.use("/api/barcode-print", barcodePrintRoutes);
app.use("/api/stock-rebilling", StockRebillingRoutes);
app.use("/api/sales-invoice", salesInvoiceRoutes);
app.use("/api/sales-return", salesReturnRoutes);
app.use("/api/sales-return-request", salesReturnRequestRoutes);
app.use("/api/hold-bill", holdBillRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/stock-ledger", stockLedgerRoutes);
app.use("/api/gst-reports", gstReportsRoutes);
app.use("/api/gst-returns", gstReturnsRoutes);
app.use("/api/annexure-reports", annexureReportsRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/attributes", attributeRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/hsn", hsnRoutes);
app.use("/api/price-levels", priceLevelRoutes);
app.use("/api/due-payment", duePaymentRoutes);
app.use("/api/session", sessionRoutes);




app.get("/", (req, res) => {
  res.send("Backend is running ");
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/supermarket';

mongoose.connect(MONGO_URI)
  .then(() => console.log('mongoDB Connected'))
  .catch(err => console.error('mongoDB connection error:', err));


const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});