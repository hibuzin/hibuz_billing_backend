const { spawn } = require("child_process");
const path = require("path");

exports.scanPurchaseBill = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Bill image is required"
      });
    }

    const imagePath = req.file.path;
    const pythonFile = path.join(__dirname, "../paddle_ocr.py");

    const pythonCommand =
      process.platform === "win32" ? "python" : "python3";

    const python = spawn(pythonCommand, [pythonFile, imagePath]);

    let result = "";
    let error = "";

    python.stdout.on("data", (data) => {
      result += data.toString();
    });

    python.stderr.on("data", (data) => {
      error += data.toString();
    });

    python.on("error", (err) => {
      return res.status(500).json({
        success: false,
        message: "Failed to start Python process",
        error: err.message
      });
    });

    python.on("close", () => {
      console.log("PYTHON RESULT:", result);
      console.log("PYTHON ERROR:", error);

      if (error && !result) {
        return res.status(500).json({
          success: false,
          message: "OCR failed",
          error
        });
      }

      try {
        const parsed = JSON.parse(result);

        return res.status(200).json({
          success: parsed.success,
          rawText: parsed.text || "",
          fullResult: parsed
        });
      } catch (e) {
        return res.status(500).json({
          success: false,
          message: "Invalid response from OCR",
          result,
          error: e.message
        });
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
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