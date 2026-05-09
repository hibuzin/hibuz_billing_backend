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
const cashierRoutes = require("./routes/cashier");
const adminsRoutes = require("./routes/admins");
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



app.use("/api/auth", authRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/admins", adminsRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/productadd", productaddRoutes);
app.use("/api/supplier", supplierRoutes);
app.use("/api/scan", scanRoutes);
app.use("/api/bill", billRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/Damage", DamageRoutes);
app.use("/api/GRN", GRNRoutes);
app.use("/api/return", returnRoutes);
app.use("/api", reorderRoutes);
app.use("/api", barcodePrintRoutes);
app.use("/api", StockRebillingRoutes);



app.get("/", (req, res) => {
  res.send("Backend is running ");
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/supermarket';

mongoose.connect(MONGO_URI)
  .then(() => console.log('mongoDB Connected'))
  .catch(err => console.error('mongoDB connection error:', err));


const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://192.168.31.181:${PORT}`);
});