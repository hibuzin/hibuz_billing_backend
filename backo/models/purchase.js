const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({

    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier",
        required: true
    },


    grnDate: {
        type: Date
    },

    invoiceNo: {
        type: String,
        required: true,
        trim: true
    },

    invoiceDate: {
        type: String

    },

    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },

            productName: {
                type: String,
                default: ""
            },


            hsnId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Hsn",
                default: null
            },

            hsnCode: {
                type: String,
                default: ""
            },

            gstpercentage: {
                type: Number,
                default: 0
            },

            categoryId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Category"
            },

            categoryName: {
                type: String,
                default: ""
            },

            brand: {
                type: String,
                default: ""
            },

            description: {
                type: String,
                default: ""
            },

            flavor: {
                type: String,
                default: ""
            },

            litters: {
                type: String,
                default: ""
            },

            qty: {
                type: Number,
                required: true

            },

            costPrice: {
                type: Number,
                required: true
            },

            mrp: {
                type: Number,
                default: 0
            },

            sellingPrice: {
                type: Number,
                default: 0
            },

            priceLevel: {
                pricingType: {
                    type: String,
                    enum: ["manual", "auto", "slab"],
                    default: "manual"
                },

                manualPrice: {
                    type: Number,
                    default: 0
                },

                autoPricing: {
                    baseOn: {
                        type: String,
                        enum: ["costPrice", "mrp"],
                        default: "costPrice"
                    },
                    profitPercent: {
                        type: Number,
                        default: 0
                    }
                },

                slabs: [
                    {
                        minQty: {
                            type: Number,
                            required: true
                        },
                        maxQty: {
                            type: Number,
                            default: null
                        },
                        price: {
                            type: Number,
                            required: true
                        }
                    }
                ]
            },
            gst: {
                type: Number,
                default: 0
            },



            barcode: {
                type: String,
                default: ""
            },

            receivedQty: {
                type: Number,
                default: 0
            },

            pendingQty: {
                type: Number,
                default: 0
            }
        }
    ],

    supplierBillAmount: {
        type: Number,
        default: 0
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    balanceAmount: {
        type: Number,
        default: 0
    },

    paymentHistory: [
        {
            amount: Number,
            paidDate: {
                type: Date,
                default: Date.now
            },
            note: String
        }
    ],



    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },


    superAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    totalAmount: {
        type: Number,
        required: true
    }

}, { timestamps: true });

module.exports = mongoose.model("Purchase", purchaseSchema);