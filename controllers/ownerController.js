const Company = require('../models/Company');
const User = require('../models/User');

const createCompany = async (req, res) => {
  try {
    const { name, domain, admin } = req.body;

    if (!name || !admin || !admin.email || !admin.name || !admin.password) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Company name and admin details are required.',
      });
    }

    const existingCompany = await Company.findOne({
      name: name.trim(),
      ownerId: req.user._id,
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        code: 'COMPANY_EXISTS',
        message: 'You already have a company with this name.',
      });
    }

    const existingEmail = await User.findOne({
      email: admin.email.trim().toLowerCase(),
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    if (admin.password.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Admin password must be at least 6 characters.',
      });
    }

    const company = await Company.create({
      name: name.trim(),
      domain: domain ? String(domain).trim() : '',
      ownerId: req.user._id,
    });

    const adminUser = await User.create({
      name: admin.name.trim(),
      email: admin.email.trim().toLowerCase(),
      password: admin.password,
      department: admin.department ? String(admin.department).trim() : '',
      position: admin.position ? String(admin.position).trim() : '',
      role: 'admin',
      isActive: true,
      companyId: company._id,
    });

    const adminResponse = {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      department: adminUser.department,
      position: adminUser.position,
      companyId: adminUser.companyId,
      isActive: adminUser.isActive,
    };

    return res.status(201).json({
      success: true,
      data: {
        company,
        admin: adminResponse,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to create company.',
    });
  }
};

const getOwnerCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: companies,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch companies.',
    });
  }
};

const getCompanyAdmins = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await Company.findOne({
      _id: id,
      ownerId: req.user._id,
    }).lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found for this owner.',
      });
    }

    const admins = await User.find({
      companyId: company._id,
      role: { $in: ['admin', 'manager'] },
    })
      .select('-password -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        company,
        admins,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch company admins.',
    });
  }
};

module.exports = {
  createCompany,
  getOwnerCompanies,
  getCompanyAdmins,
};

