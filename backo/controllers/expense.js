const mongoose = require("mongoose");

const ExpenseCategory = require("../models/expense_category");
const Expense = require("../models/expense");
const Counter = require("../models/counter");
const { attachHierarchy } = require("../utils/hierarchy");

const getNextExpenseNo = async (superAdminId) => {
    const result = await Counter.findOneAndUpdate(
        { name: `expense_${superAdminId}` },
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return `EXP-${String(result.seq).padStart(5, "0")}`;
};

exports.createExpenseCategory = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Expense category name is required"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const exists = await ExpenseCategory.findOne({
            name: name.trim(),
            superAdminId: hierarchy.superAdminId,
            isActive: true
        });

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Expense category already exists"
            });
        }

        const category = await ExpenseCategory.create({
            name: name.trim(),
            ...hierarchy,
            createdBy: req.user.userId
        });

        return res.status(201).json({
            success: true,
            message: "Expense category created successfully",
            data: category
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.createExpense = async (req, res) => {
    try {
        const {
            categoryId,
            originalInvoiceNo,
            expenseDate,
            amount,
            paymentMode,
            note
        } = req.body;

        if (!categoryId || !expenseDate || !amount) {
            return res.status(400).json({
                success: false,
                message: "Category, date and amount are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid category id"
            });
        }

        const hierarchy = attachHierarchy(req.user);

        const category = await ExpenseCategory.findOne({
            _id: categoryId,
            superAdminId: hierarchy.superAdminId,
            isActive: true
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Expense category not found"
            });
        }

        const finalDate = new Date(expenseDate);

        if (isNaN(finalDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid expense date"
            });
        }

        const expenseAmount = Number(amount);

        if (isNaN(expenseAmount) || expenseAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid expense amount"
            });
        }

        const expenseNo = await getNextExpenseNo(hierarchy.superAdminId);

        const expense = await Expense.create({
            expenseNo,
            categoryId,
            originalInvoiceNo: originalInvoiceNo || "",
            expenseDate: finalDate,
            amount: expenseAmount,
            paymentMode: paymentMode || "cash",
            note: note || "",
            ...hierarchy,
            createdBy: req.user.userId
        });

        return res.status(201).json({
            success: true,
            message: "Expense created successfully",
            data: {
                id: expense._id,
                expenseNo: expense.expenseNo,
                category: {
                    id: category._id,
                    name: category.name
                },
                originalInvoiceNo: expense.originalInvoiceNo,
                expenseDate: expense.expenseDate
                    ? new Date(expense.expenseDate).toLocaleDateString("en-CA")
                    : "",
                amount: expense.amount,
                paymentMode: expense.paymentMode,
                note: expense.note
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};