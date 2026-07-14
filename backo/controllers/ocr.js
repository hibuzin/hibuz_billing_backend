const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.scanPurchaseBill = async (req, res) => {
  try {
    console.log("========== OCR START ==========");

    if (!req.file) {
      console.log("No file received");
      return res.status(400).json({
        success: false,
        message: "Bill image is required"
      });
    }

    console.log("File:", req.file);

    const imagePath = req.file.path;
    const pythonFile = path.join(__dirname, "../paddle_ocr.py");

    console.log("Image Path:", imagePath);
    console.log("Python File:", pythonFile);

    console.log("Image Exists:", fs.existsSync(imagePath));
    console.log("Python Exists:", fs.existsSync(pythonFile));

    const pythonCommand =
      process.platform === "win32" ? "python" : "python3";

    console.log("Python Command:", pythonCommand);

    const python = spawn(pythonCommand, [pythonFile, imagePath]);

    let result = "";
    let error = "";

    python.stdout.on("data", (data) => {
      console.log("===== STDOUT CHUNK =====");
      console.log(data.toString());
      result += data.toString();
    });

    python.stderr.on("data", (data) => {
      console.log("===== STDERR CHUNK =====");
      console.log(data.toString());
      error += data.toString();
    });

    python.on("spawn", () => {
      console.log("Python process started");
    });

    python.on("error", (err) => {
      console.log("PROCESS ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to start Python",
        error: err.message
      });
    });

    python.on("close", (code) => {
      console.log("========== PYTHON CLOSED ==========");
      console.log("Exit Code:", code);
      console.log("Result:");
      console.log(result);
      console.log("Error:");
      console.log(error);

      try {
        const jsonStart = result.indexOf("{");

        console.log("JSON Start:", jsonStart);

        if (jsonStart === -1) {
          console.log("No JSON found in output");

          return res.status(500).json({
            success: false,
            message: "No JSON returned from OCR",
            result,
            error
          });
        }

        const jsonString = result.substring(jsonStart);

        console.log("JSON STRING:");
        console.log(jsonString);

        const parsed = JSON.parse(jsonString);

        console.log("PARSED:");
        console.log(parsed);

        return res.json({
          success: true,
          rawText: parsed.text,
          fullResult: parsed
        });

      } catch (e) {
        console.log("JSON PARSE ERROR");
        console.log(e);

        return res.status(500).json({
          success: false,
          message: "JSON Parse Error",
          error: e.message,
          result,
          pythonError: error
        });
      }
    });

  } catch (err) {
    console.log("NODE ERROR");
    console.log(err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message
    });
  }
};

const parseAmount = (v) => Number(String(v).replace(/[$,]/g, ""));

exports.scanAndParsePurchaseBill = async (req, res) => {
  try {
    const rawText = req.body.rawText;

    if (!rawText) {
      return res.status(400).json({
        success: false,
        message: "rawText is required"
      });
    }

    const lines = rawText
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const invoiceLine = lines.find(l => /invoice/i.test(l));
    const dateLine = lines.find(l => /^date/i.test(l));
    const totalLine = lines.find(l => /total/i.test(l));

    const items = [];

    for (let i = 0; i < lines.length - 3; i++) {
      const name = lines[i];
      const qty = Number(lines[i + 1]);
      const unitPrice = parseAmount(lines[i + 2]);
      const amount = parseAmount(lines[i + 3]);

      if (
        name &&
        !isNaN(qty) &&
        !isNaN(unitPrice) &&
        !isNaN(amount)
      ) {
        items.push({
          productName: name,
          qty,
          costPrice: unitPrice,
          amount
        });
      }
    }

    return res.status(200).json({
      success: true,
      invoiceNo: invoiceLine || "",
      invoiceDate: dateLine || "",
      totalAmount: totalLine || "",
      items
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Parse failed",
      error: error.message
    });
  }
};