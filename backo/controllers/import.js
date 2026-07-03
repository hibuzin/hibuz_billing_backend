// File: controllers/import.js
const csv = require("csvtojson");
const fs = require("fs");
// const Product = require("../models/Product"); // Import your Mongoose model

// Export the function so the route can use it
exports.importProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload a CSV file." });
    }

    // Convert CSV to JSON
    const jsonArray = await csv().fromFile(req.file.path);

    // Map the old data to your MongoDB Schema
    const productsToInsert = jsonArray.map((item) => {
      return {
        name: item.ProductName || item.Name,
        sku: item.Barcode || item.SKU,
        price: parseFloat(item.SalePrice || 0),
        cost: parseFloat(item.PurchasePrice || 0),
        stock: parseInt(item.Quantity || 0),
        category: item.CategoryName || "Uncategorized"
      };
    });

    // Save to database
    // await Product.insertMany(productsToInsert);

    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    // Send response
    res.status(200).json({
      success: true,
      message: `${productsToInsert.length} products imported successfully!`,
      data: productsToInsert 
    });

  } catch (error) {
    console.error("Import Error:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: "Error importing data", error: error.message });
  }
};