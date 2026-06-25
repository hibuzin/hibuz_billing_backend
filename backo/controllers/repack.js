const mongoose = require("mongoose");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const Repack = require("../models/repack");
const { attachHierarchy } = require("../utils/hierarchy");

const convertToKg = (unit, unitValue, qty) => {
    const finalUnit = String(unit || "").trim().toLowerCase();
    const finalUnitValue = Number(unitValue || 1);
    const finalQty = Number(qty || 0);

    if (finalUnit === "kg") {
        return finalQty * finalUnitValue;
    }

    if (finalUnit === "g" || finalUnit === "gram" || finalUnit === "grams") {
        return (finalQty * finalUnitValue) / 1000;
    }

    throw new Error("Only kg and g units are allowed in repack");
};

exports.createRepack = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const {
            fromProductId,
            outputs,
            note
        } = req.body;

        if (!fromProductId) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "From product required"
            });
        }

        if (!Array.isArray(outputs) || outputs.length === 0) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "Outputs are required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const fromProduct = await Product.findOne({
            _id: fromProductId,
            superAdminId: hierarchy.superAdminId
        }).session(session);

        if (!fromProduct) {
            throw new Error("From product not found");
        }

        const fromUnitValue = Number(fromProduct.unitValue || 1);
        const fromUnit = String(fromProduct.unit || "").trim().toLowerCase();

        if (!["kg", "g", "gram", "grams"].includes(fromUnit)) {
            throw new Error("From product must be kg or g unit");
        }

        const fromBarcodeData = await Barcode.findOne({
            productId: fromProductId,
            superAdminId: hierarchy.superAdminId,
            availableQty: { $gt: 0 }
        }).session(session);

        if (!fromBarcodeData) {
            throw new Error("Available barcode not found for from product");
        }

        const fromBarcode = fromBarcodeData.code;

        const finalOutputs = [];

        for (const item of outputs) {
            const toProduct = await Product.findOne({
                _id: item.toProductId,
                superAdminId: hierarchy.superAdminId
            }).session(session);

            if (!toProduct) {
                throw new Error("Output product not found");
            }

            const toQty = Number(item.toQty);

            if (isNaN(toQty) || toQty <= 0) {
                throw new Error("Valid output qty is required");
            }

            let finalToBarcode = item.toBarcode
                ? String(item.toBarcode).trim()
                : "";

            if (!finalToBarcode) {
                const existingToBarcode = await Barcode.findOne({
                    productId: item.toProductId,
                    superAdminId: hierarchy.superAdminId
                }).session(session);

                if (existingToBarcode) {
                    finalToBarcode = existingToBarcode.code;
                }
            }

            if (!finalToBarcode) {
                throw new Error("Output barcode is required or no barcode found for output product");
            }

            finalOutputs.push({
                ...item,
                toBarcode: finalToBarcode,
                product: toProduct
            });
        }

        let totalOutputKg = 0;

        for (const item of finalOutputs) {
            totalOutputKg += convertToKg(
                item.product.unit,
                item.product.unitValue,
                item.toQty
            );
        }

        if (totalOutputKg <= 0) {
            throw new Error("Valid output kg is required");
        }

        let deductQty = 0;

        if (fromUnit === "kg") {
            deductQty = totalOutputKg / fromUnitValue;
        }

        if (fromUnit === "g" || fromUnit === "gram" || fromUnit === "grams") {
            deductQty = (totalOutputKg * 1000) / fromUnitValue;
        }

        if (fromProduct.stock < deductQty) {
            throw new Error("Not enough product stock");
        }

        if (fromBarcodeData.availableQty < deductQty) {
            throw new Error("Not enough barcode stock");
        }

        await Product.updateOne(
            {
                _id: fromProductId,
                superAdminId: hierarchy.superAdminId
            },
            {
                $inc: { stock: -deductQty }
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
                    availableQty: -deductQty
                }
            },
            { session }
        );

        for (const item of finalOutputs) {
            const toProduct = item.product;

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

                        unit: toProduct.unit,
                        unitValue: toProduct.unitValue,

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
                    inputKg: totalOutputKg,
                    deductQty,
                    fromUnit: fromProduct.unit,
                    fromUnitValue,

                    outputs: finalOutputs.map((item) => ({
                        toProductId: item.toProductId,
                        toBarcode: String(item.toBarcode).trim(),
                        toQty: Number(item.toQty),
                        toUnit: item.product.unit,
                        toUnitValue: item.product.unitValue
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


exports.getRepacks = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const repacks = await Repack.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("fromProductId", "name brand unit unitValue")
            .populate("outputs.toProductId", "name brand unit unitValue")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Repacks fetched successfully",
            count: repacks.length,
            data: repacks
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.getRepackById = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repack id"
            });
        }

        const repack = await Repack.findOne({
            _id: id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("fromProductId", "name brand unit unitValue")
            .populate("outputs.toProductId", "name brand unit unitValue");

        if (!repack) {
            return res.status(404).json({
                success: false,
                message: "Repack not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Repack fetched successfully",
            data: repack
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};