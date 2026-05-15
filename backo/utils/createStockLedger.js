const StockLedger = require("../models/StockLedger");

const createStockLedger = async ({
    productId,
    type,
    direction,
    qty,
    beforeStock,
    afterStock,
    referenceId = null,
    referenceModel = "",
    note = "",
    userId,
    role,
    superAdminId,
    adminId = null
}) => {
    try {
        await StockLedger.create({
            productId,
            type,
            direction,
            qty,
            beforeStock,
            afterStock,
            referenceId,
            referenceModel,
            note,
            userId,
            role,
            superAdminId,
            adminId
        });
    } catch (err) {
        console.log("Stock Ledger Error:", err.message);
    }
};

module.exports = createStockLedger;