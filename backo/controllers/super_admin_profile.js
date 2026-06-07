const User = require("../models/user");
const mongoose = require("mongoose");
const Seperate = require("../models/Seperate");

// checking
exports.createSeperateAccount = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!name || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name, email and phone are required"
            });
        }

        const superAdmin = await User.findOne({
            _id: userId,
            role: "super_admin"
        }).select("+password");

        if (!superAdmin) {
            return res.status(404).json({
                success: false,
                message: "Super Admin not found"
            });
        }

        const alreadyCreated = await Seperate.findOne({
            createdBy: userId
        });

        if (alreadyCreated) {
            return res.status(400).json({
                success: false,
                message: "My account already created"
            });
        }



        const seperate = await Seperate.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password: superAdmin.password,
            createdBy: userId
        });

        return res.status(201).json({
            success: true,
            message: "My account saved successfully",
            data: {
                _id: seperate._id,
                name: seperate.name,
                email: seperate.email,
                phone: seperate.phone
            }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};


exports.getSeperateAccount = async (req, res) => {
    try {

        const seperate = await Seperate.findOne({
            createdBy: req.user.userId || req.user.id
        });

        if (!seperate) {
            return res.status(404).json({
                success: false,
                message: "Seperate account not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: seperate
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};

exports.getSuperAdminMe = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;

        const superAdmin = await User.findOne({
            _id: userId,
            role: "super_admin"
        }).select(
            "CompanyName CompanyPhone CompanyEmail address state city pincode gstnumber role isActive lastLogin createdAt updatedAt"
        );


        if (!superAdmin) {
            return res.status(404).json({
                success: false,
                message: "Super Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Super Admin profile fetched successfully",
            data: superAdmin
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
};

exports.updateSuperAdminMe = async (req, res) => {
    try {

        const userId = req.user.userId || req.user.id;

        const {
            CompanyName,
            CompanyPhone,
            CompanyEmail,
            address,
            state,
            city,
            pincode,
            gstnumber
        } = req.body;

        const superAdmin = await User.findOne({
            _id: userId,
            role: "super_admin"
        });

        if (!superAdmin) {
            return res.status(404).json({
                success: false,
                message: "Super Admin not found"
            });
        }

        if (CompanyEmail) {

            const existingEmail = await User.findOne({
                CompanyEmail: CompanyEmail.trim().toLowerCase(),
                _id: { $ne: userId }
            });

            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Company email already exists"
                });
            }

            superAdmin.CompanyEmail =
                CompanyEmail.trim().toLowerCase();
        }

        if (CompanyName) {
            superAdmin.CompanyName = CompanyName.trim();
        }

        if (CompanyPhone) {
            superAdmin.CompanyPhone = CompanyPhone.trim();
        }

        if (address) {
            superAdmin.address = address.trim();
        }

        if (state) {
            superAdmin.state = state.trim();
        }

        if (city) {
            superAdmin.city = city.trim();
        }

        if (pincode) {
            superAdmin.pincode = pincode.trim();
        }

        if (gstnumber) {
            superAdmin.gstnumber = gstnumber.trim().toUpperCase();
        }

        await superAdmin.save();

        return res.status(200).json({
            success: true,
            message: "Super Admin updated successfully",
            data: {
                _id: superAdmin._id,
                CompanyName: superAdmin.CompanyName,
                CompanyPhone: superAdmin.CompanyPhone,
                CompanyEmail: superAdmin.CompanyEmail,
                address: superAdmin.address,
                state: superAdmin.state,
                city: superAdmin.city,
                pincode: superAdmin.pincode,
                gstnumber: superAdmin.gstnumber,
                role: superAdmin.role
            }
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};


exports.updateSeperateAccount = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            name,
            email,
            phone
        } = req.body;

        const seperate = await Seperate.findById(id);

        if (!seperate) {
            return res.status(404).json({
                success: false,
                message: "Seperate account not found"
            });
        }

        if (email) {

            const existingEmail = await Seperate.findOne({
                email: email.trim().toLowerCase(),
                _id: { $ne: id }
            });

            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Email already exists"
                });
            }

            seperate.email = email.trim().toLowerCase();
        }

        if (name) {
            seperate.name = name.trim();
        }

        if (phone) {
            seperate.phone = phone.trim();
        }

        await seperate.save();

        return res.status(200).json({
            success: true,
            message: "Seperate account updated successfully",
            data: seperate
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });

    }
};