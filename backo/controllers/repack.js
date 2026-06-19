const mongoose = require("mongoose");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const Repack = require("../models/repack");
const { attachHierarchy } = require("../utils/hierarchy");

exports.createRepack = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const {
            fromProductId,
            fromBarcode,
            fromQty,
            outputs,
            note
        } = req.body;

        if (!fromProductId || !fromBarcode || !fromQty ) {
            return res.status(400).json({
                success: false,
                message: "From product, barcode, qty and unit kg are required"
            });
        }

        if (!Array.isArray(outputs) || outputs.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Outputs are required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

       

        let outputKg = 0;

        for (const item of outputs) {
            outputKg += Number(item.toQty) * Number(item.toUnitKg);
        }

        if (inputKg !== outputKg) {
            return res.status(400).json({
                success: false,
                message: `Repack mismatch. Input ${inputKg}kg but output ${outputKg}kg`
            });
        }

        const fromProduct = await Product.findOne({
            _id: fromProductId,
            superAdminId: hierarchy.superAdminId
        }).session(session);

        if (!fromProduct) {
            return res.status(404).json({
                success: false,
                message: "From product not found"
            });
        }

        const fromBarcodeData = await Barcode.findOne({
            productId: fromProductId,
            code: String(fromBarcode).trim(),
            superAdminId: hierarchy.superAdminId
        }).session(session);

        if (!fromBarcodeData) {
            return res.status(404).json({
                success: false,
                message: "From barcode not found"
            });
        }

        if (fromProduct.stock < Number(fromQty)) {
            return res.status(400).json({
                success: false,
                message: "Not enough product stock"
            });
        }

        if (fromBarcodeData.availableQty < Number(fromQty)) {
            return res.status(400).json({
                success: false,
                message: "Not enough barcode stock"
            });
        }

        await Product.updateOne(
            {
                _id: fromProductId,
                superAdminId: hierarchy.superAdminId
            },
            {
                $inc: { stock: -Number(fromQty) }
            },
            { session }
        );

        await Barcode.updateOne(
            {
                _id: fromBarcodeData._id,
                superAdminId: hierarchy.superAdminId
            },
            {
                $inc: {
                    availableQty: -Number(fromQty)
                }
            },
            { session }
        );

        for (const item of outputs) {
            const toProduct = await Product.findOne({
                _id: item.toProductId,
                superAdminId: hierarchy.superAdminId
            }).session(session);

            if (!toProduct) {
                throw new Error("Output product not found");
            }

            await Product.updateOne(
                {
                    _id: item.toProductId,
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $inc: { stock: Number(item.toQty) }
                },
                { session }
            );

            await Barcode.findOneAndUpdate(
                {
                    productId: item.toProductId,
                    code: String(item.toBarcode).trim(),
                    superAdminId: hierarchy.superAdminId
                },
                {
                    $set: {
                        productId: item.toProductId,
                        code: String(item.toBarcode).trim(),

                        mrp: toProduct.mrp || 0,
                        sellingPrice: toProduct.sellingPrice || 0,
                        costPrice: toProduct.costPrice || 0,
                        gstRate: toProduct.gstRate || 0,

                        isSold: false,

                        ...hierarchy,
                        createdBy: req.user.userId
                    },
                    $inc: {
                        qty: Number(item.toQty),
                        availableQty: Number(item.toQty)
                    }
                },
                {
                    upsert: true,
                    new: true,
                    session
                }
            );
        }

        const repack = await Repack.create(
            [
                {
                    repackNo: `REP-${Date.now()}`,

                    fromProductId,
                    fromBarcode: String(fromBarcode).trim(),
                    fromQty: Number(fromQty),
                    

                    outputs: outputs.map((item) => ({
                        toProductId: item.toProductId,
                        toBarcode: String(item.toBarcode).trim(),
                        toQty: Number(item.toQty),
                        toUnitKg: Number(item.toUnitKg)
                    })),

                    note: note || "",

                    ...hierarchy,
                    createdBy: req.user.userId
                }
            ],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: "Repack created successfully",
            data: repack[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};