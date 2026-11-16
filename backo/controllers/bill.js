const mongoose = require("mongoose");
const Bill = require("../models/bill");

const counter = require("../models/counter");
const Offer = require("../models/offer");
const Product = require("../models/product");
const Barcode = require("../models/barcode");
const Customer = require("../models/customer");
const PriceLevel = require("../models/price_level");
const DuePayment = require("../models/due_payment");
const { attachHierarchy } = require("../utils/hierarchy");
const CashRegister = require("../models/cashregister");
const Session = require("../models/session");
const AuditLog = require("../models/audit_log");



const consumeBarcodeStock = async (barcode, qty) => {

    qty = Number(qty);

    if (!barcode) {
        throw new Error("Barcode not found");
    }

    if (!Array.isArray(barcode.batches) || barcode.batches.length === 0) {
        throw new Error(
            `No batches found for barcode ${barcode.code}`
        );
    }

    let remainingQty = qty;
    let totalSelling = 0;

    const consumedBatches = [];

    
    for (const batch of barcode.batches) {

        if (remainingQty <= 0) {
            break;
        }

        const available = Number(batch.availableQty || 0);

        if (available <= 0) {
            continue;
        }

        const consumeQty = Math.min(
            available,
            remainingQty
        );

        batch.availableQty =
            available - consumeQty;

        totalSelling +=
            consumeQty * Number(batch.sellingPrice || 0);

        consumedBatches.push({
            batchId: batch._id,
            qty: consumeQty,
            sellingPrice: Number(batch.sellingPrice || 0),
            costPrice: Number(batch.costPrice || 0),
            mrp: Number(batch.mrp || 0)
        });

        remainingQty -= consumeQty;
    }

    if (remainingQty > 0) {
        throw new Error(
            `Batch stock not available for barcode ${barcode.code}. Required: ${qty}`
        );
    }

    barcode.availableQty =
        Number(barcode.availableQty || 0) - qty;

    barcode.isSold =
        barcode.availableQty <= 0;

    await barcode.save();

    return {
        consumedBatches,
        totalSelling
    };
};


const getNextInvoiceNo = async (superAdminId) => {
    const result = await counter.findOneAndUpdate(
        {
            name: `invoice_${superAdminId}`
        },
        {
            $inc: { seq: 1 }
        },
        {
            returnDocument: "after",
            upsert: true
        }
    );

    return `INV-${String(result.seq).padStart(5, "0")}`;
};


exports.createBill = async (req, res) => {
    try {
        const {
            codes,
            items: billItems = [],
            isWalkInCustomer = false,
            customerId,
            redeemPoints = 0,
            priceLevel = "normal",

            discountPercent,
            discountAmount,

            paymentStatus = "paid",
            paymentMethod = "cash",

            payments = [],
            paidAmount = 0,
            dueDate
        } = req.body;

        if (
            (!Array.isArray(codes) || codes.length === 0) &&
            (!Array.isArray(billItems) || billItems.length === 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "No products provided"
            });
        }

        const hierarchy = attachHierarchy(req.user);


        const userId = req.user.userId || req.user.id;

        // Check active session
        const activeSession = await Session.findOne({
            cashier: userId,
            superAdminId: hierarchy.superAdminId,
            status: "open"
        });

        if (!activeSession) {
            return res.status(400).json({
                success: false,
                message: "Please start a session before creating a bill."
            });
        }

        const invoiceNo = await getNextInvoiceNo(hierarchy.superAdminId);

        console.log("Generated Invoice:", invoiceNo);
        let subTotal = 0;
        let totalGST = 0;
        let totalItemDiscount = 0;

        const items = [];

        const gstAuditItems = [];

        const codeQtyMap = {};

        for (const code of codes || []) {
            const searchValue = String(code).trim();

            if (!searchValue) continue;

            codeQtyMap[searchValue] =
                (codeQtyMap[searchValue] || 0) + 1;
        }

        for (const [searchValue, qty] of Object.entries(codeQtyMap)) {


            let barcode = await Barcode.findOne({
                code: searchValue,
                superAdminId: hierarchy.superAdminId
            });

            if (!barcode) {
                return res.status(400).json({
                    success: false,
                    message: `Barcode not found: ${searchValue}`
                });
            }

            if (Number(barcode.availableQty || 0) < qty) {
                return res.status(400).json({
                    success: false,
                    message: `Stock not available for barcode ${searchValue}. Available: ${barcode.availableQty || 0}`
                });
            }

            let product = null;

            if (barcode) {
                product = await Product.findOne({
                    _id: barcode.productId,
                    superAdminId: hierarchy.superAdminId
                });
            }

            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found for: ${searchValue}`
                });
            }

            const batchResult = await consumeBarcodeStock(
                barcode,
                qty
            );

            const consumedBatches = batchResult.consumedBatches;

            const totalSelling = batchResult.totalSelling;

            const normalSellingPrice =
                Number((totalSelling / qty).toFixed(2));

            let price = normalSellingPrice;
            let slabPrice = null;
            let discountPerItem = 0;
            let totalDiscount = 0;

            let appliedPriceLevel = "normal";
            let appliedSlab = null;


            const gstRate = Number(barcode.gstRate || product.gstRate || 0);

            const grossAmount = Number((price * qty).toFixed(2));



            const itemDiscountPercent = 0;
            const itemDiscountAmount = 0;

            let itemDiscount = 0;

            if (itemDiscountPercent > 0) {
                itemDiscount = Number(
                    ((grossAmount * itemDiscountPercent) / 100).toFixed(2)
                );
            } else if (itemDiscountAmount > 0) {
                itemDiscount = itemDiscountAmount;
            }

            totalItemDiscount += itemDiscount;

            const finalPrice = Number(
                (grossAmount - itemDiscount).toFixed(2)
            );

            const taxableAmount = Number((finalPrice / (1 + gstRate / 100)).toFixed(2));
            const gstAmount = Number((finalPrice - taxableAmount).toFixed(2));

            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({
                productId: product._id,
                barcodeId: barcode._id,
                barcode: barcode.code,
                productName: product.name || "",
                name: product.name || "",

                totalAmount: grossAmount,
                discountPercent: Number(discountPercent || 0),
                discountAmount: itemDiscount,
                finalPrice,

                unit: barcode.unit || product.unit || "pcs",
                unitValue: barcode.unitValue || product.unitValue || 1,
                unitText: `${barcode.unitValue || product.unitValue || 1} ${barcode.unit || product.unit || "pcs"}`,

                totalkg: `${qty * Number(barcode.unitValue || product.unitValue || 1)} ${barcode.unit || product.unit || "pcs"}`,
                qty,

                mrp: barcode.mrp || 0,
                sellingPrice: barcode.sellingPrice || 0,
                appliedPriceLevel,
                appliedSlab,
                gstRate,
                gstAmount
            });

            if (gstRate > 0 && gstAmount > 0) {
                gstAuditItems.push({
                    productId: product._id,
                    productName: product.name || "",
                    barcode: barcode.code,
                    qty,
                    sellingPrice: barcode.sellingPrice || 0,
                    gstRate,
                    gstAmount,
                    finalPrice
                });
            }

            barcode.availableQty = Math.max(Number(barcode.availableQty || 0) - qty, 0);
            await barcode.save();

            await Product.updateOne(
                { _id: product._id, superAdminId: hierarchy.superAdminId },
                { $inc: { stock: -qty } }
            );
        }


        for (const billItem of billItems) {

            const qty = Number(billItem.qty || 1);



            let freeQty = 0;

            const buyGetOffer = await Offer.findOne({
                superAdminId: hierarchy.superAdminId,
                offerType: "buy_get",
                isActive: true,
                buyProductId: billItem.productId
            });


            if (buyGetOffer && qty >= buyGetOffer.buyQty) {
                freeQty =
                    Math.floor(qty / buyGetOffer.buyQty) *
                    buyGetOffer.freeQty;
            }

            const discountPercent = Number(billItem.discountPercent || 0);
            const discountAmount = Number(billItem.discountAmount || 0);




            if (isNaN(qty) || qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity"
                });
            }

            const product = await Product.findOne({
                _id: billItem.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const barcode = await Barcode.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId
            });


            const batchResult = await consumeBarcodeStock(
                barcode,
                qty
            );

            const consumedBatches = batchResult.consumedBatches;

            const totalSelling = batchResult.totalSelling;

            const normalSellingPrice =
                Number((totalSelling / qty).toFixed(2));

            let price = normalSellingPrice;
            let slabPrice = null;
            let discountPerItem = 0;
            let totalDiscount = 0;

            let appliedPriceLevel = "normal";
            let appliedSlab = null;

            const productPriceLevel = await PriceLevel.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId,
                isActive: true
            });

            if (productPriceLevel) {

                if (
                    priceLevel === "manual" &&
                    productPriceLevel.pricingType === "manual"
                ) {

                    price = Number(productPriceLevel.manualPrice || price);
                    appliedPriceLevel = "manual";

                } else if (
                    priceLevel === "auto" &&
                    productPriceLevel.pricingType === "auto"
                ) {

                    const profitPercent =
                        Number(productPriceLevel.autoPricing?.profitPercent || 0);

                    const baseOn =
                        productPriceLevel.autoPricing?.baseOn || "costPrice";

                    const basePrice =
                        baseOn === "mrp"
                            ? Number(barcode.mrp || 0)
                            : Number(barcode.costPrice || 0);

                    price =
                        basePrice +
                        (basePrice * profitPercent / 100);

                    appliedPriceLevel = "auto";

                } else if (
                    priceLevel === "slab" &&
                    productPriceLevel.pricingType === "slab"
                ) {

                    const slab = productPriceLevel.slabs.find((s) => {

                        const minOk = qty >= Number(s.minQty || 0);

                        const maxOk =
                            s.maxQty === null ||
                            qty <= Number(s.maxQty);

                        return minOk && maxOk;
                    });

                    if (slab) {
                        slabPrice = Number(slab.price || normalSellingPrice);

                        discountPerItem = Number((normalSellingPrice - slabPrice).toFixed(2));
                        totalDiscount = Number((discountPerItem * qty).toFixed(2));

                        price = slabPrice;

                        appliedPriceLevel = "slab";
                        appliedSlab = {
                            minQty: slab.minQty,
                            maxQty: slab.maxQty,
                            slabPrice,
                            normalSellingPrice,
                            discountPerItem,
                            totalDiscount
                        };
                    }
                }
            }


            const gstRate = Number(barcode.gstRate || product.gstRate || 0);

            if (price <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid selling price for product: ${product.name}`
                });

            }

            const grossAmount = Number((price * qty).toFixed(2));



            let itemDiscount = 0;

            if (Number(discountPercent) > 0) {
                itemDiscount = Number(
                    ((grossAmount * Number(discountPercent)) / 100).toFixed(2)
                );
            }
            else if (Number(discountAmount) > 0) {
                itemDiscount = Number(discountAmount);
            }

            let calculatedDiscountPercent = discountPercent;

            if (
                calculatedDiscountPercent === 0 &&
                itemDiscount > 0 &&
                grossAmount > 0
            ) {
                calculatedDiscountPercent = Number(
                    ((itemDiscount / grossAmount) * 100).toFixed(2)
                );
            }

            totalItemDiscount += itemDiscount;

            const finalPrice = Number(
                (grossAmount - itemDiscount).toFixed(2)
            );

            const taxableAmount = Number((finalPrice / (1 + gstRate / 100)).toFixed(2));
            const gstAmount = Number((finalPrice - taxableAmount).toFixed(2));


            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({



                productId: product._id,
                barcodeId: barcode._id,
                barcode: barcode.code,

                totalAmount: grossAmount,
                discountPercent: calculatedDiscountPercent,
                discountAmount: itemDiscount,
                finalPrice,

                productName: product.name || "",
                name: product.name || "",
                unit: barcode.unit || product.unit || "pcs",
                unitValue: barcode.unitValue || product.unitValue || 1,
                unitText: `${barcode.unitValue || product.unitValue || 1} ${barcode.unit || product.unit || "pcs"}`,
                totalUnitQty: qty * Number(barcode.unitValue || product.unitValue || 1),
                totalUnitText: `${qty * Number(barcode.unitValue || product.unitValue || 1)} ${barcode.unit || product.unit || "pcs"}`,

                qty,
                freeQty,
                totalGivenQty: qty + freeQty,

                mrp: barcode.mrp || 0,


                appliedPriceLevel,
                appliedSlab,


                sellingPrice: normalSellingPrice,
                normalSellingPrice,
                slabPrice,
                discountPerItem,
                totalDiscount,


                gstRate,
                gstAmount,
            });


            if (gstRate > 0 && gstAmount > 0) {
                gstAuditItems.push({
                    productId: product._id,
                    productName: product.name || "",
                    barcode: barcode.code,
                    qty,
                    price,
                    gstRate,
                    gstAmount,
                    finalPrice
                });
            }


            const availableStock =
                Number(product.stock || 0) -
                Number(product.reservedStock || 0);

            if (availableStock < qty) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} stock not available`
                });
            }

            barcode.availableQty = Math.max(
                Number(barcode.availableQty || 0) - (qty + freeQty),
                0
            );

            await barcode.save();

            const stockUpdate = await Product.updateOne(
                {
                    _id: product._id,
                    superAdminId: hierarchy.superAdminId,
                    stock: { $gte: qty + freeQty }
                },
                {
                    $inc: {
                        stock: -(qty + freeQty)
                    }
                }

            );

            if (stockUpdate.modifiedCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} stock update failed`
                });
            }
        }



        const beforeBillDiscount = Number(
            (subTotal + totalGST).toFixed(2)
        );

        let billDiscount = 0;
        let billDiscountPercentage = 0;

        if (Number(discountPercent) > 0) {

            billDiscount = Number(
                (
                    beforeBillDiscount *
                    Number(discountPercent) /
                    100
                ).toFixed(2)
            );

            billDiscountPercentage = Number(discountPercent);

        } else if (Number(discountAmount) > 0) {

            billDiscount = Number(discountAmount);

            billDiscountPercentage = Number(
                (
                    billDiscount /
                    beforeBillDiscount *
                    100
                ).toFixed(2)
            );
        }


        let discount = 0;
        let customer = null;

        if (!isWalkInCustomer) {

            if (!customerId) {
                return res.status(400).json({
                    success: false,
                    message: "Customer is required or select Walk in Customer."
                });
            }

            customer = await Customer.findOne({
                customerId,
                superAdminId: hierarchy.superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }

            if (Number(redeemPoints) > 0) {
                if (customer.loyaltyPoints < Number(redeemPoints)) {
                    return res.status(400).json({
                        success: false,
                        message: "Not enough loyalty points"
                    });
                }

                discount = Number(redeemPoints);
                customer.loyaltyPoints -= discount;
            }
        } else {

            customer = null;
        }



        let grandTotal = Number(
            (
                subTotal +
                totalGST -
                billDiscount -
                discount
            ).toFixed(2)
        );

        let offer = null;
        let offerDiscount = 0;
        let appliedOffer = null;



        offer = await Offer.findOne({
            superAdminId: hierarchy.superAdminId,
            isActive: true,
            minimumPurchase: { $lte: grandTotal }
        })
            .sort({ minimumPurchase: -1 });



        if (offer) {

            if (offer.discountType === "amount") {

                offerDiscount = Number(offer.discountValue);

            } else {

                offerDiscount = Number(
                    (
                        grandTotal *
                        offer.discountValue /
                        100
                    ).toFixed(2)
                );
            }

            appliedOffer = offer.offerName;
        }

        grandTotal = Number(
            (grandTotal - offerDiscount).toFixed(2)
        );

        let finalPayments = [];

        if (paymentStatus === "due" || paymentStatus === "partial") {

            if (payments.length > 0) {
                finalPayments = payments;
            } else if (Number(paidAmount) > 0) {
                finalPayments = [
                    {
                        method: paymentMethod,
                        amount: Number(paidAmount)
                    }
                ];
            }

        } else if (paymentMethod === "split") {

            finalPayments = payments;

        } else {

            if (payments.length > 0) {
                finalPayments = payments;

            } else {
                finalPayments = [
                    {
                        method: paymentMethod,
                        amount: grandTotal
                    }
                ];
            }
        }

        const allowedMethods = ["cash", "upi", "card", "cheque", "sodexo"];

        for (const pay of finalPayments) {

            if (!allowedMethods.includes(pay.method)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment method"
                });
            }

            const totalPaid = Number(
                finalPayments.reduce(
                    (sum, pay) => sum + Number(pay.amount || 0),
                    0
                ).toFixed(2)
            );

            if (Number(pay.amount || 0) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment amount"
                });
            }


            if (pay.method === "cheque") {

                if (!pay.details) {
                    return res.status(400).json({
                        success: false,
                        message: "Cheque details are required"
                    });
                }

                const {
                    chequeNo,
                    chequeDate,
                    bankName,
                    accountHolder
                } = pay.details;

                if (
                    !chequeNo ||
                    !chequeDate ||
                    !bankName ||
                    !accountHolder
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Complete cheque details are required"
                    });
                }
            }
        }


        const totalPaid = Number(
            finalPayments.reduce(
                (sum, pay) => sum + Number(pay.amount || 0),
                0
            ).toFixed(2)
        );


        let pendingAmount = 0;

        if (paymentStatus === "paid") {
            if (totalPaid !== grandTotal) {
                return res.status(400).json({
                    success: false,
                    message: "Paid amount must equal grand total"
                });
            }
        }

        if (paymentStatus === "partial") {
            if (!customer) {
                return res.status(400).json({
                    success: false,
                    message: "Customer required for partial payment"
                });
            }

            if (totalPaid <= 0 || totalPaid >= grandTotal) {
                return res.status(400).json({
                    success: false,
                    message: "Partial paid amount must be less than grand total"
                });
            }

            pendingAmount = Number((grandTotal - totalPaid).toFixed(2));
        }

        if (paymentStatus === "due") {
            if (!customer) {
                return res.status(400).json({
                    success: false,
                    message: "Customer required for due payment"
                });
            }

            pendingAmount = Number(
                (grandTotal - totalPaid).toFixed(2)
            );
        }

        const earnedPoints = Math.floor(grandTotal / 100);

        if (customer) {
            customer.loyaltyPoints += earnedPoints;
            customer.totalSpent += grandTotal;
            await customer.save();
        }


        const bill = await Bill.create({
            items,
            summary: {
                subTotal,
                totalGST,
                discount,
                grandTotal
            },


            offer: {
                offerId: offer?._id || null,
                offerName: appliedOffer,
                discountAmount: offerDiscount
            },

            invoiceNo,
            customerId: customer ? customer._id : null,

            paymentMethod: finalPayments.length > 1 ? "split" : finalPayments[0]?.method || "due",
            paymentStatus,
            payments: finalPayments,

            paidAmount: totalPaid,
            pendingAmount,

            cashier: req.user.userId || req.user.id,
            createdBy: req.user.userId || req.user.id,

            role: req.user.role,
            ...hierarchy
        });

        await AuditLog.create({
            userId: req.user.userId || req.user.id,
            role: req.user.role,

            module: "Bill",
            action: "Create",

            description: `Bill generated - Invoice: ${bill.invoiceNo}`,

            referenceId: bill._id,

            metadata: {
                invoiceNo: bill.invoiceNo,
                customerId: customer ? customer._id : null,
                customerName: customer ? customer.name : "Walk-in Customer",

                totalAmount: Number((subTotal + totalGST + totalItemDiscount).toFixed(2)),
                subTotal: Number(subTotal.toFixed(2)),

                totalGSTAmount: Number(totalGST.toFixed(2)),
                totalCGSTAmount: Number((totalGST / 2).toFixed(2)),
                totalSGSTAmount: Number((totalGST / 2).toFixed(2)),

                itemDiscountAmount: Number(totalItemDiscount.toFixed(2)),

                billDiscountAmount: Number(billDiscount.toFixed(2)),

                billDiscountPercentage,

                totalDiscount: Number(
                    (totalItemDiscount + billDiscount).toFixed(2)
                ),

                offerName: appliedOffer,
                offerAmount: offerDiscount,

                loyaltyDiscount: discount,

                grandTotal: grandTotal,

                paidAmount: bill.paidAmount,
                pendingAmount: bill.pendingAmount,

                paymentMethod: bill.paymentMethod,
                paymentStatus: bill.paymentStatus
            },

            ...hierarchy
        });


        activeSession.totalBills = (activeSession.totalBills || 0) + 1;

        activeSession.totalSales = Number(
            ((activeSession.totalSales || 0) + grandTotal).toFixed(2)
        );


        for (const pay of finalPayments) {
            const amount = Number(pay.amount || 0);

            switch (pay.method) {
                case "cash":
                    activeSession.cashSales = Number(
                        ((activeSession.cashSales || 0) + amount).toFixed(2)
                    );
                    break;

                case "upi":
                    activeSession.upiSales =
                        (activeSession.upiSales || 0) + amount;
                    break;

                case "card":
                    activeSession.cardSales =
                        (activeSession.cardSales || 0) + amount;
                    break;

                case "cheque":
                    activeSession.chequeSales =
                        (activeSession.chequeSales || 0) + amount;
                    break;

                case "sodexo":
                    activeSession.sodexoSales =
                        (activeSession.sodexoSales || 0) + amount;
                    break;
            }
        }


        activeSession.expectedCash = Number(
            (
                Number(activeSession.openingAmount || 0) +
                Number(activeSession.cashSales || 0)
            ).toFixed(2)
        );

        await activeSession.save();

        const cashRegister = await CashRegister.findOne({
            superAdminId: hierarchy.superAdminId,
            status: "open"
        });

        if (cashRegister && finalPayments.length > 0) {
            for (const pay of finalPayments) {
                const amount = Number(pay.amount || 0);

                if (pay.method === "cash") {
                    cashRegister.cashSales += amount;
                }

                if (pay.method === "upi") {
                    cashRegister.upiSales += amount;
                }

                if (pay.method === "card") {
                    cashRegister.cardSales += amount;
                }

                if (pay.method === "cheque") {
                    cashRegister.chequeSales += amount;
                }

                if (pay.method === "sodexo") {
                    cashRegister.sodexoSales += amount;
                }
            }

            cashRegister.expectedCash =
                cashRegister.openingAmount +
                cashRegister.cashSales -
                cashRegister.cashOut;

            await cashRegister.save();
        }

        if (gstAuditItems.length > 0) {
            await AuditLog.create({
                userId: req.user.userId || req.user.id,
                role: req.user.role,
                module: "GST",
                action: "CREATE",
                documentId: bill._id,
                oldData: null,
                newData: {
                    invoiceNo: bill.invoiceNo,
                    customerId: customer ? customer._id : null,
                    gstItems: gstAuditItems,
                    totalGST,
                    grandTotal
                },
                ...hierarchy
            });
        }




        const cgst = Number((totalGST / 2).toFixed(2));
        const sgst = Number((totalGST / 2).toFixed(2));

        return res.status(201).json({
            success: true,
            message: "Bill generated successfully",
            data: {
                billId: bill._id,

                invoiceNo: bill.invoiceNo,

                invoiceDate: new Date().toLocaleDateString("en-GB"),

                invoiceTime: new Date().toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }),

                customer: customer
                    ? {
                        customerId: customer.customerId,
                        customerName: customer.name,
                        mobile: customer.phone || ""
                    }
                    : {
                        customerId: null,
                        customerName: "Walk in Customer",
                        mobile: ""
                    },

                paymentMethod: bill.paymentMethod,
                paymentStatus: bill.paymentStatus,

                payments: finalPayments,

                paidAmount: totalPaid,
                pendingAmount,

                items,

                summary: {
                    totalAmount: Number((subTotal + totalGST + totalItemDiscount).toFixed(2)),
                    subTotal: Number(subTotal.toFixed(2)),
                    cgst,
                    sgst,
                    totalGST: Number(totalGST.toFixed(2)),

                    itemDiscountAmount: Number(totalItemDiscount.toFixed(2)),

                    billDiscountAmount: Number(billDiscount.toFixed(2)),

                    billDiscountPercentage,

                    totalDiscount: Number(
                        (totalItemDiscount + billDiscount).toFixed(2)
                    ),

                    offerName: appliedOffer,
                    offerAmount: offerDiscount,
                    loyaltyDiscount: discount,
                    grandTotal
                },

                loyalty: {
                    used: discount,
                    earned: earnedPoints,
                    remaining: customer ? customer.loyaltyPoints : 0
                }
            }
        });

    } catch (error) {
        console.error("BILL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.calculateBill = async (req, res) => {
    try {
        const {
            codes,
            items: billItems = [],
            customerId,
            redeemPoints = 0,
            loyaltyPoints = 0,
            priceLevel = "normal",
            discountPercent = 0,
            discountAmount = 0
        } = req.body;

        const pointsToRedeem = Number(redeemPoints || loyaltyPoints || 0);

        if (
            (!Array.isArray(codes) || codes.length === 0) &&
            (!Array.isArray(billItems) || billItems.length === 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "No products provided"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        let subTotal = 0;
        let totalGST = 0;
        let totalItemDiscount = 0;
        const items = [];
        const codeQtyMap = {};


        for (const code of codes || []) {
            const searchValue = String(code).trim();
            if (!searchValue) continue;
            codeQtyMap[searchValue] = (codeQtyMap[searchValue] || 0) + 1;
        }

        for (const [searchValue, qty] of Object.entries(codeQtyMap)) {

            let freeQty = 0;

            const barcode = await Barcode.findOne({
                code: searchValue,
                superAdminId: hierarchy.superAdminId
            });

            if (!barcode) {
                return res.status(400).json({ success: false, message: `Barcode not found: ${searchValue}` });
            }

            if (Number(barcode.availableQty || 0) < qty) {
                return res.status(400).json({ success: false, message: `Stock not available for barcode ${searchValue}. Available: ${barcode.availableQty || 0}` });
            }

            const product = await Product.findOne({
                _id: barcode.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(400).json({ success: false, message: `Product not found for: ${searchValue}` });
            }

            const price = Number(barcode.sellingPrice || 0);
            const gstRate = Number(barcode.gstRate || product.gstRate || 0);

            const grossAmount = Number((price * qty).toFixed(2));
            let itemDiscount = 0;
            let finalDiscountPercent = 0;

            if (Number(discountPercent) > 0 && Number(discountAmount) > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Provide either discountPercent or discountAmount, not both."
                });
            }

            if (Number(discountPercent) > 0) {
                finalDiscountPercent = Number(Number(discountPercent).toFixed(2));

                itemDiscount = Number(
                    ((grossAmount * finalDiscountPercent) / 100).toFixed(2)
                );
            }
            else if (Number(discountAmount) > 0) {

                if (Number(discountAmount) > grossAmount) {
                    return res.status(400).json({
                        success: false,
                        message: "Discount amount cannot exceed item amount."
                    });
                }

                itemDiscount = Number(Number(discountAmount).toFixed(2));

                finalDiscountPercent = Number(
                    ((itemDiscount / grossAmount) * 100).toFixed(2)
                );
            }

            totalItemDiscount += itemDiscount;

            const finalPrice = Number(
                (grossAmount - itemDiscount).toFixed(2)
            );
            const taxableAmount = Number((finalPrice / (1 + gstRate / 100)).toFixed(2));
            const gstAmount = Number((finalPrice - taxableAmount).toFixed(2));

            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({
                productId: product._id,
                barcodeId: barcode._id,
                barcode: barcode.code,

                productName: product.name || "",
                name: product.name || "",

                totalAmount: grossAmount,
                discountPercent: Number(discountPercent || 0),
                discountAmount: itemDiscount,
                finalPrice,

                unit: barcode.unit || product.unit || "pcs",
                unitValue: barcode.unitValue || product.unitValue || 1,
                unitText: `${barcode.unitValue || product.unitValue || 1} ${barcode.unit || product.unit || "pcs"}`,

                totalUnitQty:
                    qty * Number(barcode.unitValue || product.unitValue || 1),

                totalUnitText:
                    `${qty * Number(barcode.unitValue || product.unitValue || 1)} ${barcode.unit || product.unit || "pcs"}`,

                qty,
                freeQty,
                totalGivenQty: qty + freeQty,

                mrp: barcode.mrp || 0,

                sellingPrice: price,
                normalSellingPrice: price,

                appliedPriceLevel: "normal",
                appliedSlab: null,

                gstRate,
                gstAmount
            });
        }


        for (const billItem of billItems) {

            const qty = Number(billItem.qty || 1);

            let freeQty = 0;

            const buyGetOffer = await Offer.findOne({
                superAdminId: hierarchy.superAdminId,
                offerType: "buy_get",
                isActive: true,
                buyProductId: billItem.productId
            });

            if (buyGetOffer && qty >= buyGetOffer.buyQty) {
                freeQty =
                    Math.floor(qty / buyGetOffer.buyQty) *
                    buyGetOffer.freeQty;
            }

            const itemDiscountPercent = Number(
                billItem.discountPercent || discountPercent || 0
            );

            const itemDiscountAmount = Number(
                billItem.discountAmount || discountAmount || 0
            );

            if (isNaN(qty) || qty <= 0) {
                return res.status(400).json({ success: false, message: "Invalid quantity" });
            }

            const product = await Product.findOne({
                _id: billItem.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({ success: false, message: "Product not found" });
            }

            const barcode = await Barcode.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId
            });

            const normalSellingPrice = Number(barcode?.sellingPrice || 0);
            let price = normalSellingPrice;
            let appliedPriceLevel = "normal";
            let appliedSlab = null;
            let discountPerItem = 0;
            let totalDiscount = 0;

            const productPriceLevel = await PriceLevel.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId,
                isActive: true
            });


            if (productPriceLevel) {
                if (priceLevel === "manual" && productPriceLevel.pricingType === "manual") {
                    price = Number(productPriceLevel.manualPrice || price);
                    appliedPriceLevel = "manual";
                } else if (priceLevel === "auto" && productPriceLevel.pricingType === "auto") {
                    const profitPercent = Number(productPriceLevel.autoPricing?.profitPercent || 0);
                    const baseOn = productPriceLevel.autoPricing?.baseOn || "costPrice";
                    const basePrice = baseOn === "mrp" ? Number(barcode?.mrp || 0) : Number(barcode?.costPrice || 0);
                    price = basePrice + (basePrice * profitPercent / 100);
                    appliedPriceLevel = "auto";
                } else if (priceLevel === "slab" && productPriceLevel.pricingType === "slab") {
                    const slab = productPriceLevel.slabs.find((s) => {
                        const minOk = qty >= Number(s.minQty || 0);
                        const maxOk = s.maxQty === null || qty <= Number(s.maxQty);
                        return minOk && maxOk;
                    });

                    if (slab) {
                        const slabPrice = Number(slab.price || normalSellingPrice);
                        discountPerItem = Number((normalSellingPrice - slabPrice).toFixed(2));
                        totalDiscount = Number((discountPerItem * qty).toFixed(2));
                        price = slabPrice;
                        appliedPriceLevel = "slab";
                        appliedSlab = { minQty: slab.minQty, maxQty: slab.maxQty, slabPrice };
                    }
                }
            }

            if (price <= 0) {
                return res.status(400).json({ success: false, message: `Invalid selling price for product: ${product.name}` });
            }

            const availableStock = Number(product.stock || 0) - Number(product.reservedStock || 0);
            if (availableStock < qty) {
                return res.status(400).json({ success: false, message: `${product.name} stock not available` });
            }

            const gstRate = Number(barcode?.gstRate || product.gstRate || 0);

            const grossAmount = Number((price * qty).toFixed(2));

            let itemDiscount = 0;
            let finalDiscountPercent = 0;

            if (itemDiscountPercent > 0 && itemDiscountAmount > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Provide either discountPercent or discountAmount, not both."
                });
            }

            if (itemDiscountPercent > 0) {
                finalDiscountPercent = Number(itemDiscountPercent.toFixed(2));

                itemDiscount = Number(
                    ((grossAmount * finalDiscountPercent) / 100).toFixed(2)
                );
            }
            else if (itemDiscountAmount > 0) {

                if (itemDiscountAmount > grossAmount) {
                    return res.status(400).json({
                        success: false,
                        message: "Discount amount cannot exceed item amount."
                    });
                }

                itemDiscount = Number(itemDiscountAmount.toFixed(2));

                finalDiscountPercent = Number(
                    ((itemDiscount / grossAmount) * 100).toFixed(2)
                );
            }

            totalItemDiscount += itemDiscount;

            const finalPrice = Number(
                (grossAmount - itemDiscount).toFixed(2)
            );
            const taxableAmount = Number((finalPrice / (1 + gstRate / 100)).toFixed(2));
            const gstAmount = Number((finalPrice - taxableAmount).toFixed(2));

            subTotal += taxableAmount;
            totalGST += gstAmount;

            items.push({
                productId: product._id,
                barcodeId: barcode?._id,
                barcode: barcode?.code,

                productName: product.name || "",
                name: product.name || "",

                totalAmount: grossAmount,
                discountPercent: itemDiscountPercent,
                discountAmount: itemDiscount,
                finalPrice,

                unit: barcode?.unit || product.unit || "pcs",
                unitValue: barcode?.unitValue || product.unitValue || 1,
                unitText: `${barcode?.unitValue || product.unitValue || 1} ${barcode?.unit || product.unit || "pcs"}`,

                totalUnitQty:
                    qty * Number(barcode?.unitValue || product.unitValue || 1),

                totalUnitText:
                    `${qty * Number(barcode?.unitValue || product.unitValue || 1)} ${barcode?.unit || product.unit || "pcs"}`,

                qty,
                freeQty,
                totalGivenQty: qty + freeQty,

                mrp: barcode?.mrp || 0,

                sellingPrice: normalSellingPrice,
                normalSellingPrice,

                slabPrice:
                    appliedPriceLevel === "slab"
                        ? price
                        : null,

                discountPerItem,
                totalDiscount,

                appliedPriceLevel,
                appliedSlab,

                gstRate,
                gstAmount
            });
        }

        let loyaltyDiscount = 0;
        let customer = null;

        if (customerId) {

            customer = await Customer.findOne({
                customerId,
                superAdminId: hierarchy.superAdminId
            });

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }

            if (pointsToRedeem > 0) {

                if (customer.loyaltyPoints < pointsToRedeem) {
                    return res.status(400).json({
                        success: false,
                        message: "Not enough loyalty points"
                    });
                }

                loyaltyDiscount = pointsToRedeem;
            }
        }


        let grandTotal = Number(
            (subTotal + totalGST - loyaltyDiscount).toFixed(2)
        );

        let offer = null;
        let offerDiscount = 0;
        let appliedOffer = null;

        offer = await Offer.findOne({
            superAdminId: hierarchy.superAdminId,
            isActive: true,
            offerType: "bill",
            minimumPurchase: { $lte: grandTotal }
        }).sort({ minimumPurchase: -1 });




        if (offer) {

            if (offer.discountType === "amount") {

                offerDiscount = Number(offer.discountValue);

            } else {

                offerDiscount = Number(
                    (
                        grandTotal *
                        offer.discountValue /
                        100
                    ).toFixed(2)
                );
            }

            if (offerDiscount > grandTotal) {
                offerDiscount = grandTotal;
            }

            appliedOffer = offer.offerName;

            grandTotal = Number(
                (grandTotal - offerDiscount).toFixed(2)
            );
        }

        const cgst = Number((totalGST / 2).toFixed(2));
        const sgst = Number((totalGST / 2).toFixed(2));
        const earnedPoints = Math.floor(grandTotal / 100);

        return res.status(200).json({
            success: true,
            message: "Bill calculated successfully",
            data: {
                items,
                summary: {
                    totalAmount: Number((subTotal + totalGST + totalItemDiscount).toFixed(2)),
                    subTotal: Number(subTotal.toFixed(2)),
                    cgst,
                    sgst,
                    totalGST: Number(totalGST.toFixed(2)),
                    discountAmount: Number(totalItemDiscount.toFixed(2)),
                    loyaltyDiscount,
                    offerName: appliedOffer,
                    offerAmount: offerDiscount,
                    grandTotal
                },
                loyalty: {
                    used: loyaltyDiscount,
                    earned: earnedPoints,
                    remaining: customer
                        ? customer.loyaltyPoints - loyaltyDiscount
                        : 0
                }
            }
        });

    } catch (error) {
        console.error("CALCULATE BILL ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during calculation",
            error: error.message
        });
    }
};


exports.searchProductsForBill = async (req, res) => {
    try {
        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search is required"
            });
        }

        const searchValue = search.trim();
        const hierarchy = attachHierarchy(req.user);


        const products = await Product.find({
            superAdminId: hierarchy.superAdminId,
            name: { $regex: searchValue, $options: "i" },
            stock: { $gt: 0 }
        }).limit(20);

        const productData = await Promise.all(
            products.map(async (p) => {
                const barcode = await Barcode.findOne({
                    productId: p._id,
                    superAdminId: hierarchy.superAdminId,
                    availableQty: { $gt: 0 }
                });


                const priceLevel = await PriceLevel.findOne({
                    productId: p._id,
                    superAdminId: hierarchy.superAdminId,
                    isActive: true
                });

                return {
                    productId: p._id,
                    productName: p.name,
                    brand: p.brand,
                    barcode: barcode?.code || "",
                    qty: 1,
                    stock: p.stock,

                    mrp: barcode?.mrp || p.mrp || 0,
                    sellingPrice: barcode?.sellingPrice || p.sellingPrice || 0,
                    costPrice: barcode?.costPrice || p.costPrice || 0,
                    gstRate: p.gstRate || 0,

                    priceLevel: priceLevel ? {
                        pricingType: priceLevel.pricingType,
                        manualPrice: priceLevel.manualPrice,
                        autoPricing: priceLevel.autoPricing,
                        slabs: priceLevel.slabs
                    } : null,

                    slabPrices: priceLevel?.pricingType === "slab"
                        ? priceLevel.slabs.map(s => ({
                            minQty: s.minQty,
                            maxQty: s.maxQty,
                            price: s.price
                        }))
                        : [],

                    flavor: barcode?.flavor || "",
                    litters: barcode?.litters || "",
                    kg: barcode?.kg || "",

                    gstRate: barcode?.gstRate || p.gstRate || 0
                };
            })
        );


        const barcodes = await Barcode.find({
            superAdminId: hierarchy.superAdminId,
            code: { $regex: searchValue, $options: "i" },
            availableQty: { $gt: 0 }
        }).populate("productId");

        const barcodeData = await Promise.all(
            barcodes
                .filter((b) => b.productId)
                .map(async (b) => {
                    const priceLevel = await PriceLevel.findOne({
                        productId: b.productId._id,
                        superAdminId: hierarchy.superAdminId,
                        isActive: true
                    });

                    return {
                        productId: b.productId._id,
                        productName: b.productId.name,
                        brand: b.productId.brand,
                        barcode: b.code,
                        qty: 1,
                        stock: b.productId.stock,

                        mrp: b.mrp || b.productId.mrp || 0,
                        sellingPrice: b.sellingPrice || b.productId.sellingPrice || 0,
                        costPrice: b.costPrice || b.productId.costPrice || 0,
                        gstRate: b.productId.gstRate || 0,

                        priceLevel: priceLevel ? {
                            pricingType: priceLevel.pricingType,
                            manualPrice: priceLevel.manualPrice,
                            autoPricing: priceLevel.autoPricing,
                            slabs: priceLevel.slabs
                        } : null,

                        slabPrices: priceLevel?.pricingType === "slab"
                            ? priceLevel.slabs.map(s => ({
                                minQty: s.minQty,
                                maxQty: s.maxQty,
                                price: s.price
                            }))
                            : [],

                        flavor: b.flavor || "",
                        litters: b.litters || "",
                        kg: b.kg || "",
                        gstRate: b.productId.gstRate || 0
                    };
                })
        );


        const merged = [...barcodeData, ...productData];

        const uniqueData = merged.filter(
            (item, index, self) =>
                index === self.findIndex(
                    (x) =>
                        String(x.productId) === String(item.productId) &&
                        x.barcode === item.barcode
                )
        );

        return res.status(200).json({
            success: true,
            count: uniqueData.length,
            data: uniqueData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.searchCustomerBills = async (req, res) => {
    try {

        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search value is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const conditions = [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } }
        ];

        if (!isNaN(search)) {
            conditions.push({ customerId: Number(search) });
            conditions.push({ id: Number(search) });
        }

        const customers = await Customer.find({
            superAdminId: hierarchy.superAdminId,
            $or: conditions
        });

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const customerIds = customers.map(c => c._id);

        const bills = await Bill.find({
            superAdminId: hierarchy.superAdminId,
            $or: [
                { customerId: { $in: customerIds } },
                { invoiceNo: { $regex: search, $options: "i" } }
            ]
        })
            .populate("customerId", "name phone customerId id")
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Customer bills fetched successfully",
            count: bills.length,
            data: bills.map(bill => ({
                _id: bill._id,
                invoiceNo: bill.invoiceNo,

                customer: bill.customerId,

                items: bill.items,

                summary: bill.summary,

                paymentStatus: bill.paymentStatus,
                paymentMethod: bill.paymentMethod,

                paidAmount: bill.paidAmount,
                pendingAmount: bill.pendingAmount,

                payments: bill.payments,

                offer: bill.offer,

                createdBy: bill.createdBy,

                createdAt: bill.createdAt
            }))
        });

    } catch (error) {

        console.error("SEARCH CUSTOMER BILL ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



exports.getBills = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const bills = await Bill.find({
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "name phone customerId")
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 });

        const billsWithFormattedDates = bills.map(bill => {
            const totalItems = bill.items.length;

            const totalQty = bill.items.reduce(
                (sum, item) => sum + Number(item.qty || 0),
                0
            );

            const totalUnitQty = bill.items.reduce(
                (sum, item) =>
                    sum + (Number(item.qty || 0) * Number(item.unitValue || 1)),
                0
            );

            return {
                billId: bill._id,
                invoiceNo: bill.invoiceNo,

                invoiceDate: new Date(bill.createdAt).toLocaleDateString("en-GB", {
                    timeZone: "Asia/Kolkata"
                }),

                invoiceTime: new Date(bill.createdAt).toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                }),

                customer: bill.customerId
                    ? {
                        customerId: bill.customerId.customerId,
                        name: bill.customerId.name,
                        mobile: bill.customerId.phone
                    }
                    : null,

                cashier: bill.createdBy
                    ? {
                        id: bill.createdBy._id,
                        name: bill.createdBy.name,
                        email: bill.createdBy.email,
                        role: bill.createdBy.role
                    }
                    : null,

                payment: {
                    paymentMethod: bill.paymentMethod,
                    paymentStatus: bill.paymentStatus,
                    payments: bill.payments,
                    paidAmount: bill.paidAmount,
                    pendingAmount: bill.pendingAmount
                },

                summary: {
                    subTotal: bill.summary.subTotal,
                    totalGST: bill.summary.totalGST,
                    discount: bill.summary.discount,

                    loyaltyDiscount: bill.summary.loyaltyDiscount || 0,

                    offerName: bill.summary.offerName || null,
                    offerAmount: bill.summary.offerAmount || 0,

                    grandTotal: bill.summary.grandTotal
                },

                totals: {
                    totalItems,
                    totalQty,
                    totalUnitQty
                },

                items: bill.items.map(item => ({
                    productId: item.productId,
                    barcodeId: item.barcodeId,
                    barcode: item.barcode,

                    name: item.name,

                    qty: item.qty,
                    freeQty: item.freeQty || 0,
                    totalGivenQty: item.totalGivenQty || item.qty,

                    unit: item.unit,
                    unitValue: item.unitValue,
                    unitText: item.unitText,

                    mrp: item.mrp,

                    price: item.sellingPrice || item.price,

                    totalAmount: item.totalAmount,
                    discountPercent: item.discountPercent,
                    discountAmount: item.discountAmount,

                    gstRate: item.gstRate,
                    gstAmount: item.gstAmount,

                    finalPrice: item.finalPrice,

                    appliedPriceLevel: item.appliedPriceLevel,
                    appliedSlab: item.appliedSlab
                })),

                createdAt: new Date(bill.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                }),

                updatedAt: new Date(bill.updatedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                })
            };
        });

        return res.status(200).json({
            success: true,
            message: "Bills fetched successfully",
            count: bills.length,

            data: billsWithFormattedDates
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};


exports.getWalkInCustomerBills = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const bills = await Bill.find({
            superAdminId: hierarchy.superAdminId,
            customerId: null
        })
            .sort({ createdAt: -1 })
            .populate("createdBy", "name CompanyName");

        const data = bills.map((bill) => ({
            billId: bill._id,
            invoiceNo: bill.invoiceNo,

            invoiceDate: bill.createdAt.toLocaleDateString("en-GB"),
            invoiceTime: bill.createdAt.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
            }),

            customer: {
                customerId: null,
                customerName: "Walk in Customer",
                mobile: ""
            },

            items: bill.items.map(item => ({
                productId: item.productId,
                productName: item.productName || item.name,
                barcode: item.barcode,
                qty: item.qty,
                freeQty: item.freeQty || 0,
                totalGivenQty: item.totalGivenQty || item.qty,
                unit: item.unit,
                unitValue: item.unitValue,
                sellingPrice: item.sellingPrice,
                finalPrice: item.finalPrice,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount
            })),

            totalItems: bill.items.length,

            summary: {
                subTotal: bill.summary?.subTotal || 0,
                totalGST: bill.summary?.totalGST || 0,
                discount: bill.summary?.discount || 0,
                grandTotal: bill.summary?.grandTotal || 0
            },

            paidAmount: bill.paidAmount || 0,
            pendingAmount: bill.pendingAmount || 0,

            paymentMethod: bill.paymentMethod,
            paymentStatus: bill.paymentStatus
        }));

        return res.status(200).json({
            success: true,
            totalBills: data.length,
            data
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.salescheck = async (req, res) => {
    try {
        const { type = "today" } = req.query;
        const hierarchy = attachHierarchy(req.user);

        const now = new Date();
        let startDate;

        if (type === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (type === "week") {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (type === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (type === "year") {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid type. Use today, week, month, or year"
            });
        }

        const sales = await Bill.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    createdAt: { $gte: startDate, $lte: now },
                    paymentStatus: "paid"
                }
            },
            {
                $group: {
                    _id: null,
                    totalBills: { $sum: 1 },
                    totalSales: { $sum: "$summary.grandTotal" },
                    totalGST: { $sum: "$summary.totalGST" },
                    totalDiscount: { $sum: "$summary.discount" },
                    subTotal: { $sum: "$summary.subTotal" }
                }
            }
        ]);

        const result = sales[0] || {
            totalBills: 0,
            totalSales: 0,
            totalGST: 0,
            totalDiscount: 0,
            subTotal: 0
        };

        return res.status(200).json({
            success: true,
            message: `${type} sales fetched successfully`,
            filter: {
                type,
                from: startDate,
                to: now
            },
            data: result
        });

    } catch (error) {
        console.error("SALES CHECK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}


exports.cashierWiseSales = async (req, res) => {
    try {
        const { type = "today" } = req.query;
        const hierarchy = attachHierarchy(req.user);

        const now = new Date();
        let startDate;

        if (type === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (type === "week") {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (type === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (type === "year") {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid type. Use today, week, month, or year"
            });
        }

        const sales = await Bill.aggregate([
            {
                $match: {
                    superAdminId: hierarchy.superAdminId,
                    createdAt: { $gte: startDate, $lte: now },
                    paymentStatus: "paid"
                }
            },
            {
                $group: {
                    _id: "$createdBy",
                    totalBills: { $sum: 1 },
                    subTotal: { $sum: "$summary.subTotal" },
                    totalGST: { $sum: "$summary.totalGST" },
                    totalDiscount: { $sum: "$summary.discount" },
                    totalSales: { $sum: "$summary.grandTotal" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "cashier"
                }
            },
            {
                $unwind: {
                    path: "$cashier",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    cashierId: "$_id",
                    cashierName: { $ifNull: ["$cashier.name", "Unknown"] },
                    cashierEmail: { $ifNull: ["$cashier.email", ""] },
                    totalBills: 1,
                    subTotal: 1,
                    totalGST: 1,
                    totalDiscount: 1,
                    totalSales: 1
                }
            },
            {
                $sort: { totalSales: -1 }
            }
        ]);

        return res.status(200).json({
            success: true,
            message: "Cashier wise sales fetched successfully",
            filter: {
                type,
                from: startDate,
                to: now
            },
            data: sales
        });

    } catch (error) {
        console.error("CASHIER SALES ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}


exports.getBillById = async (req, res) => {
    try {
        const hierarchy = attachHierarchy(req.user);

        const bill = await Bill.findOne({
            _id: req.params.id,
            superAdminId: hierarchy.superAdminId
        })
            .populate("customerId", "name phone customerId")
            .populate("createdBy", "name email role");

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }

        const formattedBill = {
            ...bill.toObject(),

            createdAt: new Date(bill.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
            }),

            updatedAt: new Date(bill.updatedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
            })
        };

        const totalGST = Number(formattedBill.summary?.totalGST || 0);

        const cgst = Number((totalGST / 2).toFixed(2));
        const sgst = Number((totalGST / 2).toFixed(2));

        const response = {
            billId: formattedBill._id,

            invoiceNo: formattedBill.invoiceNo,

            invoiceDate: new Date(bill.createdAt).toLocaleDateString("en-GB"),

            invoiceTime: new Date(bill.createdAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }),

            customer: formattedBill.customerId
                ? {
                    customerId: formattedBill.customerId.customerId,
                    customerName: formattedBill.customerId.name,
                    mobile: formattedBill.customerId.phone || ""
                }
                : null,

            paymentMethod: formattedBill.paymentMethod,
            paymentStatus: formattedBill.paymentStatus,

            payments: formattedBill.payments,

            paidAmount: formattedBill.paidAmount,
            pendingAmount: formattedBill.pendingAmount,

            items: formattedBill.items,

            summary: {
                totalAmount: Number(
                    (
                        Number(formattedBill.summary.subTotal || 0) +
                        Number(formattedBill.summary.totalGST || 0) +
                        formattedBill.items.reduce(
                            (sum, item) => sum + Number(item.discountAmount || 0),
                            0
                        )
                    ).toFixed(2)
                ),

                subTotal: Number(formattedBill.summary.subTotal || 0),

                cgst,
                sgst,

                totalGST: Number(formattedBill.summary.totalGST || 0),

                discountAmount: Number(
                    formattedBill.items.reduce(
                        (sum, item) => sum + Number(item.discountAmount || 0),
                        0
                    ).toFixed(2)
                ),

                loyaltyDiscount: Number(formattedBill.summary.discount || 0),

                offerName: formattedBill.offer?.offerName || null,

                offerAmount: Number(
                    formattedBill.offer?.discountAmount || 0
                ),

                grandTotal: Number(formattedBill.summary.grandTotal || 0)
            },

            loyalty: {
                used: Number(formattedBill.summary.loyaltyDiscount || 0)
            },

            createdBy: formattedBill.createdBy
        };

        return res.status(200).json({
            success: true,
            message: "Bill fetched successfully",
            data: response
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



exports.editBill = async (req, res) => {
    try {
        const { billId } = req.params;

        const {
            items: billItems = [],

            discountPercent = 0,
            discountAmount = 0,

            paymentStatus = "paid",
            paymentMethod = "cash",

            payments = [],
            paidAmount = 0
        } = req.body;

        const hierarchy = attachHierarchy(req.user);

        // ================================
        // 1. FIND BILL
        // ================================
        const bill = await Bill.findOne({
            _id: billId,
            superAdminId: hierarchy.superAdminId
        });

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }

        // ================================
        // 2. ONLY ALLOW EDIT WITHIN 24 HOURS
        // ================================
        const billCreatedTime = new Date(bill.createdAt).getTime();
        const currentTime = Date.now();

        const difference = currentTime - billCreatedTime;

        const ONE_DAY = 24 * 60 * 60 * 1000;

        if (difference > ONE_DAY) {
            return res.status(403).json({
                success: false,
                message: "Bill can only be edited within 24 hours of creation"
            });
        }

        if (!Array.isArray(billItems) || billItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one item is required"
            });
        }

        // Keep old values for session update
        const oldGrandTotal = Number(
            bill.summary?.grandTotal || 0
        );

        const oldPayments = bill.payments || [];

        // ================================
        // 3. RESTORE OLD STOCK
        // ================================
        for (const oldItem of bill.items || []) {

            const restoreQty =
                Number(oldItem.qty || 0) +
                Number(oldItem.freeQty || 0);

            if (oldItem.barcodeId) {
                await Barcode.updateOne(
                    {
                        _id: oldItem.barcodeId,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            availableQty: restoreQty
                        }
                    }
                );
            }

            if (oldItem.productId) {
                await Product.updateOne(
                    {
                        _id: oldItem.productId,
                        superAdminId: hierarchy.superAdminId
                    },
                    {
                        $inc: {
                            stock: restoreQty
                        }
                    }
                );
            }
        }

        // ================================
        // 4. CALCULATE NEW ITEMS
        // ================================
        let subTotal = 0;
        let totalGST = 0;
        let totalItemDiscount = 0;

        const newItems = [];

        for (const billItem of billItems) {

            const qty = Number(billItem.qty || 0);

            if (qty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid quantity"
                });
            }

            const product = await Product.findOne({
                _id: billItem.productId,
                superAdminId: hierarchy.superAdminId
            });

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            const barcode = await Barcode.findOne({
                productId: product._id,
                superAdminId: hierarchy.superAdminId
            });

            if (!barcode) {
                return res.status(404).json({
                    success: false,
                    message: `Barcode not found for ${product.name}`
                });
            }

            // ================================
            // BUY GET OFFER
            // ================================
            let freeQty = 0;

            const buyGetOffer = await Offer.findOne({
                superAdminId: hierarchy.superAdminId,
                offerType: "buy_get",
                isActive: true,
                buyProductId: product._id
            });

            if (
                buyGetOffer &&
                qty >= Number(buyGetOffer.buyQty || 0)
            ) {
                freeQty =
                    Math.floor(
                        qty / Number(buyGetOffer.buyQty)
                    ) *
                    Number(buyGetOffer.freeQty || 0);
            }

            const totalRequiredQty = qty + freeQty;

            // ================================
            // STOCK CHECK
            // ================================
            if (
                Number(barcode.availableQty || 0) <
                totalRequiredQty
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `${product.name} stock not available. ` +
                        `Available: ${barcode.availableQty || 0}`
                });
            }

            const price = Number(
                billItem.sellingPrice ||
                barcode.sellingPrice ||
                0
            );

            if (price <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid selling price for ${product.name}`
                });
            }

            const gstRate = Number(
                billItem.gstRate ??
                barcode.gstRate ??
                product.gstRate ??
                0
            );

            const grossAmount = Number(
                (price * qty).toFixed(2)
            );

            // ================================
            // ITEM DISCOUNT
            // ================================
            const itemDiscountPercent = Number(
                billItem.discountPercent || 0
            );

            const itemDiscountAmount = Number(
                billItem.discountAmount || 0
            );

            let itemDiscount = 0;

            if (itemDiscountPercent > 0) {
                itemDiscount = Number(
                    (
                        grossAmount *
                        itemDiscountPercent /
                        100
                    ).toFixed(2)
                );

            } else if (itemDiscountAmount > 0) {
                itemDiscount = Number(
                    itemDiscountAmount.toFixed(2)
                );
            }

            if (itemDiscount > grossAmount) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Discount cannot exceed item total for ${product.name}`
                });
            }

            let calculatedDiscountPercent =
                itemDiscountPercent;

            if (
                calculatedDiscountPercent === 0 &&
                itemDiscount > 0 &&
                grossAmount > 0
            ) {
                calculatedDiscountPercent = Number(
                    (
                        itemDiscount /
                        grossAmount *
                        100
                    ).toFixed(2)
                );
            }

            totalItemDiscount += itemDiscount;

            const finalPrice = Number(
                (
                    grossAmount -
                    itemDiscount
                ).toFixed(2)
            );

            // GST inclusive calculation
            const taxableAmount = Number(
                (
                    finalPrice /
                    (1 + gstRate / 100)
                ).toFixed(2)
            );

            const gstAmount = Number(
                (
                    finalPrice -
                    taxableAmount
                ).toFixed(2)
            );

            subTotal += taxableAmount;
            totalGST += gstAmount;

            newItems.push({
                productId: product._id,

                barcodeId: barcode._id,
                barcode: barcode.code,

                productName: product.name || "",
                name: product.name || "",

                qty,
                freeQty,
                totalGivenQty: qty + freeQty,

                unit:
                    barcode.unit ||
                    product.unit ||
                    "pcs",

                unitValue:
                    barcode.unitValue ||
                    product.unitValue ||
                    1,

                unitText:
                    `${barcode.unitValue || product.unitValue || 1} ` +
                    `${barcode.unit || product.unit || "pcs"}`,

                totalUnitQty:
                    qty *
                    Number(
                        barcode.unitValue ||
                        product.unitValue ||
                        1
                    ),

                totalUnitText:
                    `${qty *
                    Number(
                        barcode.unitValue ||
                        product.unitValue ||
                        1
                    )} ` +
                    `${barcode.unit || product.unit || "pcs"}`,

                mrp: Number(barcode.mrp || 0),

                sellingPrice: price,
                normalSellingPrice:
                    Number(barcode.sellingPrice || 0),

                totalAmount: grossAmount,

                discountPercent:
                    calculatedDiscountPercent,

                discountAmount:
                    itemDiscount,

                finalPrice,

                gstRate,
                gstAmount
            });

            // ================================
            // DEDUCT NEW STOCK
            // ================================
            barcode.availableQty =
                Number(barcode.availableQty || 0) -
                totalRequiredQty;

            await barcode.save();

            const stockUpdate =
                await Product.updateOne(
                    {
                        _id: product._id,
                        superAdminId:
                            hierarchy.superAdminId,

                        stock: {
                            $gte: totalRequiredQty
                        }
                    },
                    {
                        $inc: {
                            stock: -totalRequiredQty
                        }
                    }
                );

            if (stockUpdate.modifiedCount === 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        `${product.name} stock update failed`
                });
            }
        }

        subTotal = Number(subTotal.toFixed(2));
        totalGST = Number(totalGST.toFixed(2));

        // ================================
        // 5. BILL DISCOUNT
        // ================================
        const beforeBillDiscount = Number(
            (subTotal + totalGST).toFixed(2)
        );

        let billDiscount = 0;
        let billDiscountPercentage = 0;

        if (Number(discountPercent) > 0) {

            billDiscount = Number(
                (
                    beforeBillDiscount *
                    Number(discountPercent) /
                    100
                ).toFixed(2)
            );

            billDiscountPercentage =
                Number(discountPercent);

        } else if (Number(discountAmount) > 0) {

            billDiscount =
                Number(discountAmount);

            billDiscountPercentage =
                beforeBillDiscount > 0
                    ? Number(
                        (
                            billDiscount /
                            beforeBillDiscount *
                            100
                        ).toFixed(2)
                    )
                    : 0;
        }

        // ================================
        // KEEP EXISTING LOYALTY DISCOUNT
        // ================================
        const loyaltyDiscount = Number(
            bill.summary?.discount || 0
        );

        // ================================
        // 6. OFFER
        // ================================
        let grandTotal = Number(
            (
                subTotal +
                totalGST -
                billDiscount -
                loyaltyDiscount
            ).toFixed(2)
        );

        let offer = null;
        let offerDiscount = 0;
        let appliedOffer = null;

        offer = await Offer.findOne({
            superAdminId:
                hierarchy.superAdminId,

            isActive: true,

            minimumPurchase: {
                $lte: grandTotal
            }
        }).sort({
            minimumPurchase: -1
        });

        if (offer) {

            if (
                offer.discountType === "amount"
            ) {
                offerDiscount =
                    Number(offer.discountValue || 0);

            } else {
                offerDiscount = Number(
                    (
                        grandTotal *
                        Number(
                            offer.discountValue || 0
                        ) /
                        100
                    ).toFixed(2)
                );
            }

            appliedOffer =
                offer.offerName;
        }

        grandTotal = Number(
            Math.max(
                grandTotal - offerDiscount,
                0
            ).toFixed(2)
        );

        // ================================
        // 7. PAYMENT
        // ================================
        let finalPayments = [];

        if (
            paymentStatus === "due" ||
            paymentStatus === "partial"
        ) {

            if (
                Array.isArray(payments) &&
                payments.length > 0
            ) {
                finalPayments = payments;

            } else if (
                Number(paidAmount) > 0
            ) {
                finalPayments = [
                    {
                        method: paymentMethod,
                        amount:
                            Number(paidAmount)
                    }
                ];
            }

        } else if (
            paymentMethod === "split"
        ) {

            finalPayments = payments;

        } else {

            finalPayments = [
                {
                    method: paymentMethod,
                    amount: grandTotal
                }
            ];
        }

        const allowedMethods = [
            "cash",
            "upi",
            "card",
            "cheque",
            "sodexo"
        ];

        for (const pay of finalPayments) {

            if (
                !allowedMethods.includes(
                    pay.method
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment method"
                });
            }

            if (
                Number(pay.amount || 0) <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment amount"
                });
            }
        }

        const totalPaid = Number(
            finalPayments
                .reduce(
                    (sum, pay) =>
                        sum +
                        Number(pay.amount || 0),
                    0
                )
                .toFixed(2)
        );

        let pendingAmount = 0;

        if (paymentStatus === "paid") {

            if (
                Math.abs(
                    totalPaid - grandTotal
                ) > 0.01
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Paid amount must equal grand total"
                });
            }
        }

        if (paymentStatus === "partial") {

            if (
                totalPaid <= 0 ||
                totalPaid >= grandTotal
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Partial amount must be less than grand total"
                });
            }

            pendingAmount = Number(
                (
                    grandTotal -
                    totalPaid
                ).toFixed(2)
            );
        }

        if (paymentStatus === "due") {

            pendingAmount = Number(
                (
                    grandTotal -
                    totalPaid
                ).toFixed(2)
            );
        }

        // ================================
        // 8. UPDATE BILL
        // ================================
        bill.items = newItems;

        bill.summary = {
            subTotal,
            totalGST,

            // existing loyalty discount
            discount: loyaltyDiscount,

            grandTotal,

            itemDiscountAmount:
                Number(
                    totalItemDiscount.toFixed(2)
                ),

            billDiscountAmount:
                billDiscount,

            billDiscountPercentage
        };

        bill.offer = {
            offerId:
                offer?._id || null,

            offerName:
                appliedOffer,

            discountAmount:
                offerDiscount
        };

        bill.paymentMethod =
            finalPayments.length > 1
                ? "split"
                : finalPayments[0]?.method ||
                "due";

        bill.paymentStatus =
            paymentStatus;

        bill.payments =
            finalPayments;

        bill.paidAmount =
            totalPaid;

        bill.pendingAmount =
            pendingAmount;

        bill.updatedBy =
            req.user.userId ||
            req.user.id;

        await bill.save();

        // ================================
        // 9. UPDATE ACTIVE SESSION
        // ================================
        const userId =
            req.user.userId ||
            req.user.id;

        const activeSession =
            await Session.findOne({
                cashier: userId,

                superAdminId:
                    hierarchy.superAdminId,

                status: "open"
            });

        if (activeSession) {

            // remove old total
            activeSession.totalSales =
                Number(
                    (
                        Number(
                            activeSession.totalSales ||
                            0
                        ) -
                        oldGrandTotal +
                        grandTotal
                    ).toFixed(2)
                );

            const getPaymentTotal = (
                paymentList,
                method
            ) => {
                return paymentList
                    .filter(
                        (p) =>
                            p.method === method
                    )
                    .reduce(
                        (sum, p) =>
                            sum +
                            Number(
                                p.amount || 0
                            ),
                        0
                    );
            };

            const methods = [
                "cash",
                "upi",
                "card",
                "cheque",
                "sodexo"
            ];

            for (const method of methods) {

                const oldAmount =
                    getPaymentTotal(
                        oldPayments,
                        method
                    );

                const newAmount =
                    getPaymentTotal(
                        finalPayments,
                        method
                    );

                const difference =
                    newAmount -
                    oldAmount;

                switch (method) {

                    case "cash":
                        activeSession.cashSales =
                            Number(
                                (
                                    Number(
                                        activeSession.cashSales ||
                                        0
                                    ) +
                                    difference
                                ).toFixed(2)
                            );
                        break;

                    case "upi":
                        activeSession.upiSales =
                            Number(
                                (
                                    Number(
                                        activeSession.upiSales ||
                                        0
                                    ) +
                                    difference
                                ).toFixed(2)
                            );
                        break;

                    case "card":
                        activeSession.cardSales =
                            Number(
                                (
                                    Number(
                                        activeSession.cardSales ||
                                        0
                                    ) +
                                    difference
                                ).toFixed(2)
                            );
                        break;

                    case "cheque":
                        activeSession.chequeSales =
                            Number(
                                (
                                    Number(
                                        activeSession.chequeSales ||
                                        0
                                    ) +
                                    difference
                                ).toFixed(2)
                            );
                        break;

                    case "sodexo":
                        activeSession.sodexoSales =
                            Number(
                                (
                                    Number(
                                        activeSession.sodexoSales ||
                                        0
                                    ) +
                                    difference
                                ).toFixed(2)
                            );
                        break;
                }
            }

            activeSession.expectedCash =
                Number(
                    (
                        Number(
                            activeSession.openingAmount ||
                            0
                        ) +
                        Number(
                            activeSession.cashSales ||
                            0
                        )
                    ).toFixed(2)
                );

            await activeSession.save();
        }

        // ================================
        // 10. AUDIT LOG
        // ================================
        await AuditLog.create({
            userId:
                req.user.userId ||
                req.user.id,

            role:
                req.user.role,

            module: "Bill",

            action: "Update",

            description:
                `Bill edited - Invoice: ${bill.invoiceNo}`,

            referenceId:
                bill._id,

            metadata: {
                invoiceNo:
                    bill.invoiceNo,

                oldGrandTotal,

                newGrandTotal:
                    grandTotal,

                paymentStatus,

                paymentMethod:
                    bill.paymentMethod
            },

            ...hierarchy
        });

        const cgst = Number(
            (totalGST / 2).toFixed(2)
        );

        const sgst = Number(
            (totalGST / 2).toFixed(2)
        );

        // ================================
        // RESPONSE
        // ================================
        return res.status(200).json({
            success: true,

            message:
                "Bill updated successfully",

            data: {
                billId:
                    bill._id,

                invoiceNo:
                    bill.invoiceNo,

                items:
                    newItems,

                paymentMethod:
                    bill.paymentMethod,

                paymentStatus,

                payments:
                    finalPayments,

                paidAmount:
                    totalPaid,

                pendingAmount,

                summary: {
                    totalAmount:
                        Number(
                            (
                                subTotal +
                                totalGST +
                                totalItemDiscount
                            ).toFixed(2)
                        ),

                    subTotal,

                    cgst,
                    sgst,

                    totalGST,

                    itemDiscountAmount:
                        Number(
                            totalItemDiscount.toFixed(2)
                        ),

                    billDiscountAmount:
                        billDiscount,

                    billDiscountPercentage,

                    offerName:
                        appliedOffer,

                    offerAmount:
                        offerDiscount,

                    loyaltyDiscount,

                    grandTotal
                }
            }
        });

    } catch (error) {

        console.error(
            "UPDATE BILL ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};