const Company = require('../models/Company');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const InvoiceTemplate = require('../models/InvoiceTemplate');
const Plan = require('../models/Plan');
const SupportTicket = require('../models/SupportTicket');
const OwnerSettings = require('../models/OwnerSettings');
const Attendance = require('../models/Attendance');
const Activity = require('../models/Activity');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pricing configuration
const PRICING_PLANS = {
  free: { basePrice: 0, maxEmployees: 25, extraPrice: 0 },
  basic: { basePrice: 999, maxEmployees: 50, extraPrice: 20 },
  pro: { basePrice: 2499, maxEmployees: 200, extraPrice: 15 },
  premium: { basePrice: 4999, maxEmployees: 500, extraPrice: 10 },
  enterprise: { basePrice: 9999, maxEmployees: Infinity, extraPrice: 0 },
};

// Helper: Calculate subscription amount
const calculateSubscriptionAmount = (planKey, employeeCount) => {
  const plan = PRICING_PLANS[planKey] || PRICING_PLANS.free;
  let total = plan.basePrice;
  if (employeeCount > plan.maxEmployees) {
    total += (employeeCount - plan.maxEmployees) * plan.extraPrice;
  }
  return total;
};

// Helper: Generate invoice number
const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

// Helper: Generate ticket number
const generateTicketNumber = () => {
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `TKT-${random}`;
};

// ═══════════════════════════════════════════════════════════
// DASHBOARD ANALYTICS
// ═══════════════════════════════════════════════════════════
const getOwnerDashboardAnalytics = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const companies = await Company.find({ ownerId, isDeleted: false }).lean();

    if (!companies.length) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalCompanies: 0,
            totalEmployees: 0,
            monthlyRecurringRevenue: 0,
            activeSubscriptions: 0,
            expiredSubscriptions: 0,
            openTickets: 0,
          },
          revenueData: [],
          planDistribution: [],
          recentCompanies: [],
          recentActivity: [],
        },
      });
    }

    const companyIds = companies.map((c) => c._id);

    // Get all employees
    const employees = await User.find({
      companyId: { $in: companyIds },
      role: 'employee',
      isActive: true,
    })
      .select('_id companyId')
      .lean();

    // Calculate metrics
    const totalEmployees = employees.length;
    const monthlyRecurringRevenue = companies.reduce((sum, company) => {
      return sum + (company.subscription?.amount || 0);
    }, 0);

    const activeSubscriptions = companies.filter(
      (c) => c.subscription?.status === 'active'
    ).length;

    const expiredSubscriptions = companies.filter(
      (c) => c.subscription?.status === 'expired'
    ).length;

    // Get open tickets count
    const openTickets = await SupportTicket.countDocuments({
      companyId: { $in: companyIds },
      status: { $in: ['open', 'in-progress'] },
    });

    // Revenue data (last 8 months)
    const revenueData = [];
    const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const baseRevenue = monthlyRecurringRevenue / companies.length || 10000;
    
    for (let i = 0; i < 8; i++) {
      const growthFactor = 1 + (i * 0.1);
      revenueData.push({
        month: months[i],
        revenue: Math.round(baseRevenue * companies.length * growthFactor),
        new: Math.round(baseRevenue * 2 * growthFactor),
      });
    }

    // Plan distribution
    const planCounts = {};
    companies.forEach((company) => {
      const plan = company.subscription?.plan || 'free';
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    });

    const planColors = {
      free: '#94a3b8',
      basic: '#4ade80',
      pro: '#38bdf8',
      premium: '#a78bfa',
      enterprise: '#f472b6',
    };

    const planDistribution = Object.entries(planCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: planColors[name] || '#94a3b8',
    }));

    // Recent companies (last 5)
    const recentCompanies = companies
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map((company) => {
        const empCount = employees.filter(
          (e) => String(e.companyId) === String(company._id)
        ).length;

        return {
          id: company._id,
          name: company.name,
          employees: empCount,
          plan: (company.subscription?.plan || 'free').charAt(0).toUpperCase() + 
                (company.subscription?.plan || 'free').slice(1),
          status: company.subscription?.status === 'active' ? 'Active' : 'Expired',
        };
      });

    // Recent activity - Include support tickets
    const recentActivity = [];
    
    // Get recent support tickets
    const recentTickets = await SupportTicket.find({
      companyId: { $in: companyIds },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('companyId', 'name')
      .populate('raisedBy', 'name email')
      .lean();

    // Add ticket activities
    recentTickets.forEach((ticket, index) => {
      const daysAgo = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      recentActivity.push({
        type: 'ticket',
        text: `${ticket.companyId?.name || 'Company'} raised ticket #${ticket.ticketNumber} — ${ticket.subject}`,
        time: daysAgo === 0 ? 'Just now' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`,
        priority: ticket.priority,
        status: ticket.status,
        ticketId: ticket._id,
      });
    });

    // Add company signup activities
    const recentCompaniesForActivity = companies
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    recentCompaniesForActivity.forEach((company, index) => {
      const daysAgo = Math.floor((Date.now() - new Date(company.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      recentActivity.push({
        type: 'signup',
        text: `${company.name} signed up — ${(company.subscription?.plan || 'Free')} Plan`,
        time: daysAgo === 0 ? 'Just now' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`,
      });
    });

    // Sort all activities by time (most recent first)
    recentActivity.sort((a, b) => {
      const parseTime = (timeStr) => {
        if (timeStr === 'Just now') return 0;
        const match = timeStr.match(/(\d+)/);
        return match ? parseInt(match[1]) : 999;
      };
      return parseTime(a.time) - parseTime(b.time);
    });

    // Limit to 10 most recent activities
    const limitedActivities = recentActivity.slice(0, 10);

    return res.json({
      success: true,
      data: {
        summary: {
          totalCompanies: companies.length,
          totalEmployees,
          monthlyRecurringRevenue,
          activeSubscriptions,
          expiredSubscriptions,
          openTickets,
        },
        revenueData,
        planDistribution,
        recentCompanies,
        recentActivity: limitedActivities,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch dashboard analytics.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// COMPANY MANAGEMENT
// ═══════════════════════════════════════════════════════════

// Get all companies with pagination and filters
const getOwnerCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, plan } = req.query;
    const ownerId = req.user._id;

    const filter = { ownerId, isDeleted: false };

    if (status && status !== 'All') {
      filter['subscription.status'] = status.toLowerCase();
    }

    if (plan) {
      filter['subscription.plan'] = plan.toLowerCase();
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } },
      ];
    }

    const companies = await Company.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Company.countDocuments(filter);

    // Enrich with admin info and employee count
    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const admin = await User.findOne({
          companyId: company._id,
          role: 'admin',
        })
          .select('name email')
          .lean();

        const employeeCount = await User.countDocuments({
          companyId: company._id,
          role: 'employee',
          isActive: true,
        });

        return {
          ...company,
          admin: admin ? { name: admin.name, email: admin.email } : null,
          employeeCount,
        };
      })
    );

    return res.json({
      success: true,
      data: {
        companies: enrichedCompanies,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch companies.',
    });
  }
};

// Get single company details
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    }).lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    // Get admin info
    const admin = await User.findOne({
      companyId: company._id,
      role: 'admin',
    })
      .select('name email')
      .lean();

    // Get employee count
    const employeeCount = await User.countDocuments({
      companyId: company._id,
      role: 'employee',
      isActive: true,
    });

    // Calculate days left
    const renewalDate = company.subscription?.renewalDate || company.createdAt;
    const daysLeft = Math.ceil(
      (new Date(renewalDate) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return res.json({
      success: true,
      data: {
        ...company,
        adminName: admin?.name || '',
        email: admin?.email || '',
        employeeCount,
        daysLeft: daysLeft > 0 ? daysLeft : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch company details.',
    });
  }
};

// Create company with admin
const createCompany = async (req, res) => {
  try {
    const {
      companyName,
      domain,
      industry,
      registrationDate,
      status,
      adminName,
      adminEmail,
      adminPassword,
      plan = 'free',
    } = req.body;

    // Validation
    if (!companyName || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Company name and admin details are required.',
      });
    }

    // Check company name uniqueness
    const existingCompany = await Company.findOne({
      name: companyName.trim(),
      isDeleted: false,
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        code: 'COMPANY_EXISTS',
        message: 'A company with this name already exists.',
      });
    }

    // Check admin email uniqueness
    const existingEmail = await User.findOne({
      email: adminEmail.trim().toLowerCase(),
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    // Validate password
    if (adminPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Admin password must be at least 6 characters.',
      });
    }

    // Calculate subscription details
    const planConfig = PRICING_PLANS[plan] || PRICING_PLANS.free;
    const startDate = new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    const subscription = {
      plan: plan.toLowerCase(),
      status: status === 'active' ? 'active' : 'trial',
      startDate,
      renewalDate,
      amount: planConfig.basePrice,
      currency: 'INR',
      employeeCount: 0,
      maxEmployees: planConfig.maxEmployees,
    };

    // Create company
    const company = await Company.create({
      name: companyName.trim(),
      domain: domain ? domain.trim() : '',
      industry: industry ? industry.trim() : '',
      registrationDate: registrationDate ? new Date(registrationDate) : startDate,
      ownerId: req.user._id,
      status: status || 'active',
      subscription,
    });

    // Create admin user
    const adminUser = await User.create({
      name: adminName.trim(),
      email: adminEmail.trim().toLowerCase(),
      password: adminPassword,
      role: 'admin',
      isActive: true,
      companyId: company._id,
    });

    // Create initial invoice if paid plan
    if (planConfig.basePrice > 0) {
      const invoice = await Invoice.create({
        invoiceNumber: generateInvoiceNumber(),
        companyId: company._id,
        ownerId: req.user._id,
        amount: planConfig.basePrice,
        plan: plan,
        status: 'pending',
        period: {
          startDate,
          endDate: renewalDate,
        },
        dueDate: renewalDate,
        description: `Initial subscription - ${plan} plan`,
        items: [
          {
            description: `${plan} plan subscription (1 year)`,
            quantity: 1,
            unitPrice: planConfig.basePrice,
            total: planConfig.basePrice,
          },
        ],
      });

      return res.status(201).json({
        success: true,
        data: {
          company,
          admin: {
            _id: adminUser._id,
            name: adminUser.name,
            email: adminUser.email,
            role: adminUser.role,
          },
          invoice,
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        company,
        admin: {
          _id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
        },
      },
    });
  } catch (error) {
    console.error('Error creating company:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to create company.',
    });
  }
};

// Update company
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;
    const updateData = req.body;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'domain',
      'industry',
      'status',
      'contactEmail',
      'contactPhone',
      'address',
      'logo',
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        company[field] = updateData[field];
      }
    });

    await company.save();

    return res.json({
      success: true,
      data: company,
      message: 'Company updated successfully.',
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update company.',
    });
  }
};

// Delete company (soft delete)
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    company.isDeleted = true;
    await company.save();

    return res.json({
      success: true,
      message: 'Company deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting company:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to delete company.',
    });
  }
};

// Update company subscription
const updateCompanySubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;
    const { plan, employeeCount } = req.body;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    const planKey = plan.toLowerCase();
    const planConfig = PRICING_PLANS[planKey];

    if (!planConfig) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PLAN',
        message: 'Invalid plan selected.',
      });
    }

    const empCount = employeeCount || company.subscription?.employeeCount || 0;
    const amount = calculateSubscriptionAmount(planKey, empCount);

    // Calculate new renewal date
    const startDate = new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    // Update subscription
    company.subscription = {
      plan: planKey,
      status: 'active',
      startDate,
      renewalDate,
      amount,
      currency: 'INR',
      employeeCount: empCount,
      maxEmployees: planConfig.maxEmployees,
    };

    await company.save();

    // Create new invoice
    const invoice = await Invoice.create({
      invoiceNumber: generateInvoiceNumber(),
      companyId: company._id,
      ownerId,
      amount,
      plan: planKey,
      status: 'pending',
      period: {
        startDate,
        endDate: renewalDate,
      },
      dueDate: renewalDate,
      description: `Subscription renewal - ${planKey} plan`,
      items: [
        {
          description: `${planKey} plan subscription (1 year)`,
          quantity: 1,
          unitPrice: planConfig.basePrice,
          total: planConfig.basePrice,
        },
      ],
    });

    return res.json({
      success: true,
      data: {
        company,
        invoice,
      },
      message: 'Subscription updated successfully.',
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update subscription.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// ADMIN MANAGEMENT
// ═══════════════════════════════════════════════════════════

// Get company admins
const getCompanyAdmins = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    }).lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
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
        company: {
          _id: company._id,
          name: company.name,
          domain: company.domain,
        },
        admins,
      },
    });
  } catch (error) {
    console.error('Error fetching company admins:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch company admins.',
    });
  }
};

// Add new admin to company
const addCompanyAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;
    const { name, email, password, department, position } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Name, email, and password are required.',
      });
    }

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    const admin = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      department: department || '',
      position: position || '',
      role: 'admin',
      isActive: true,
      companyId: company._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        position: admin.position,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    console.error('Error adding admin:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to add admin.',
    });
  }
};

// Update admin
const updateAdmin = async (req, res) => {
  try {
    const { id, adminId } = req.params;
    const ownerId = req.user._id;
    const updateData = req.body;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    const admin = await User.findOne({
      _id: adminId,
      companyId: company._id,
      role: { $in: ['admin', 'manager'] },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        code: 'ADMIN_NOT_FOUND',
        message: 'Admin not found.',
      });
    }

    const allowedFields = ['name', 'email', 'department', 'position', 'isActive'];
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        admin[field] = updateData[field];
      }
    });

    await admin.save();

    return res.json({
      success: true,
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        position: admin.position,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    console.error('Error updating admin:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update admin.',
    });
  }
};

// Delete admin
const deleteAdmin = async (req, res) => {
  try {
    const { id, adminId } = req.params;
    const ownerId = req.user._id;

    const company = await Company.findOne({
      _id: id,
      ownerId,
      isDeleted: false,
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'COMPANY_NOT_FOUND',
        message: 'Company not found.',
      });
    }

    const admin = await User.findOne({
      _id: adminId,
      companyId: company._id,
      role: { $in: ['admin', 'manager'] },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        code: 'ADMIN_NOT_FOUND',
        message: 'Admin not found.',
      });
    }

    // Soft delete by deactivating
    admin.isActive = false;
    await admin.save();

    return res.json({
      success: true,
      message: 'Admin deactivated successfully.',
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to delete admin.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// BILLING & INVOICES
// ═══════════════════════════════════════════════════════════

// Get all invoices
const getInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const ownerId = req.user._id;

    const filter = { ownerId };

    if (status && status !== 'All') {
      filter.status = status.toLowerCase();
    }

    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('companyId', 'name')
      .lean();

    const total = await Invoice.countDocuments(filter);

    return res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch invoices.',
    });
  }
};

// Get revenue analytics
const getRevenueAnalytics = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const companies = await Company.find({
      ownerId,
      isDeleted: false,
    }).lean();

    const totalRevenue = companies.reduce(
      (sum, company) => sum + (company.subscription?.amount || 0),
      0
    );

    const mrr = totalRevenue; // Monthly Recurring Revenue
    const arr = totalRevenue * 12; // Annual Recurring Revenue

    const pendingInvoices = await Invoice.find({
      ownerId,
      status: { $in: ['pending', 'overdue'] },
    }).lean();

    const pendingAmount = pendingInvoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    );

    const totalCompanies = companies.length;
    const activeCompanies = companies.filter(
      (c) => c.subscription?.status === 'active'
    ).length;

    const churnRate =
      totalCompanies > 0
        ? (((totalCompanies - activeCompanies) / totalCompanies) * 100).toFixed(1)
        : 0;

    // Revenue by month (last 8 months)
    const revenueData = [];
    const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const baseRevenue = mrr || 10000;

    for (let i = 0; i < 8; i++) {
      const growthFactor = 1 + (i * 0.1);
      revenueData.push({
        month: months[i],
        revenue: Math.round(baseRevenue * growthFactor),
        new: Math.round((baseRevenue * 0.2) * growthFactor),
      });
    }

    return res.json({
      success: true,
      data: {
        mrr,
        arr,
        pendingAmount,
        churnRate: parseFloat(churnRate),
        revenueData,
        totalCompanies,
        activeCompanies,
      },
    });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch revenue analytics.',
    });
  }
};

// Retry failed payment
const retryPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    const invoice = await Invoice.findOne({
      _id: id,
      ownerId,
      status: { $in: ['failed', 'overdue'] },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found or not eligible for retry.',
      });
    }

    // Simulate payment processing
    invoice.status = 'paid';
    invoice.paidDate = new Date();
    invoice.paymentMethod = 'credit_card';

    await invoice.save();

    // Update company subscription status if needed
    await Company.updateOne(
      { _id: invoice.companyId },
      { $set: { 'subscription.status': 'active' } }
    );

    return res.json({
      success: true,
      data: invoice,
      message: 'Payment processed successfully.',
    });
  } catch (error) {
    console.error('Error retrying payment:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to process payment.',
    });
  }
};

// Download invoice as PDF
const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;

    const invoice = await Invoice.findOne({
      _id: id,
      ownerId,
    }).populate('companyId', 'name email phone address');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber}.pdf"`
    );

    doc.pipe(res);

    // Header background
    doc.rect(0, 0, 595, 100).fill('#3b82f6');

    // Header text
    doc.fillColor('#ffffff');
    doc.fontSize(28);
    doc.font('Helvetica-Bold');
    doc.text('INVOICE', 50, 30);

    doc.fontSize(12);
    doc.font('Helvetica');
    doc.text(invoice.invoiceNumber, 50, 65);

    // Company Info
    doc.fillColor('#000000');
    doc.fontSize(11);
    doc.font('Helvetica-Bold');
    doc.text('Bill To:', 50, 130);
    doc.font('Helvetica');
    doc.fontSize(10);
    doc.text(invoice.companyId?.name || 'N/A', 50, 145);
    
    if (invoice.companyId?.email) {
      doc.text(invoice.companyId.email, 50, 160);
    }
    if (invoice.companyId?.phone) {
      doc.text(invoice.companyId.phone, 50, 175);
    }

    // Invoice Details
    doc.font('Helvetica-Bold');
    doc.fontSize(11);
    doc.text('Invoice Details:', 350, 130);
    doc.font('Helvetica');
    doc.fontSize(10);
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 350, 145);
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 350, 160);
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 350, 175);

    // Table Header
    const tableTop = 220;
    const tableHeaders = ['Description', 'Quantity', 'Unit Price', 'Total'];
    const columnWidths = [250, 80, 100, 100];
    let xPos = 50;

    // Draw header background
    doc.rect(50, tableTop, 530, 25).fill('#3b82f6');
    doc.fillColor('#ffffff');
    doc.font('Helvetica-Bold');
    doc.fontSize(10);

    tableHeaders.forEach((header, i) => {
      xPos = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(header, xPos + 5, tableTop + 7, {
        width: columnWidths[i] - 10,
        align: i === 0 ? 'left' : 'center',
      });
    });

    // Table Data
    const rowY = tableTop + 30;
    doc.fillColor('#000000');
    doc.font('Helvetica');
    doc.fontSize(10);

    const rowData = [
      `${invoice.plan?.toUpperCase() || 'N/A'} Plan Subscription`,
      '1',
      `₹${invoice.amount.toLocaleString()}`,
      `₹${invoice.amount.toLocaleString()}`,
    ];

    xPos = 50;
    rowData.forEach((data, i) => {
      xPos = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(data, xPos + 5, rowY + 7, {
        width: columnWidths[i] - 10,
        align: i === 0 ? 'left' : 'center',
      });
    });

    // Total Section
    const totalY = rowY + 50;
    doc.rect(350, totalY, 180, 30).fill('#f3f4f6');
    doc.fillColor('#000000');
    doc.font('Helvetica-Bold');
    doc.fontSize(12);
    doc.text('Total Amount:', 360, totalY + 8);
    doc.text(`₹${invoice.amount.toLocaleString()}`, 450, totalY + 8);

    // Footer
    doc.fillColor('#808080');
    doc.fontSize(8);
    doc.font('Helvetica');
    doc.text('Thank you for your business!', 50, 750);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 50, 760);

    doc.end();
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to download invoice.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// PLAN MANAGEMENT
// ═══════════════════════════════════════════════════════════

// Get all plans
const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .sort({ sortOrder: 1 });

    // If no plans exist, create default plans in database
    if (plans.length === 0) {
      const defaultPlans = [
        {
          name: 'Free Trial',
          key: 'free',
          price: 0,
          maxEmployees: 25,
          maxAdmins: 1,
          features: ['All features unlocked', '15 days trial'],
          isActive: true,
          sortOrder: 0,
        },
        {
          name: 'Basic Plan',
          key: 'basic',
          price: 999,
          maxEmployees: 50,
          maxAdmins: 2,
          features: [
            'Employee Management',
            'Leave Tracking',
            'Basic Reports',
            'Email Support',
          ],
          isActive: true,
          sortOrder: 1,
        },
        {
          name: 'Pro Plan',
          key: 'pro',
          price: 2499,
          maxEmployees: 200,
          maxAdmins: 5,
          features: [
            'Up to 200 employees INCLUDED',
            '₹15 per extra employee',
            'Priority Support',
            'Custom Branding',
            'Advanced Analytics',
          ],
          isActive: true,
          sortOrder: 2,
        },
        {
          name: 'Premium Plan',
          key: 'premium',
          price: 4999,
          maxEmployees: 500,
          maxAdmins: 10,
          features: [
            'Up to 500 employees INCLUDED',
            '₹10 per extra employee',
            'Dedicated Manager',
            'API Access',
            'SLA 99.9%',
            'Custom Integrations',
          ],
          isActive: true,
          sortOrder: 3,
        },
        {
          name: 'Enterprise',
          key: 'enterprise',
          price: 9999,
          maxEmployees: 999999,
          maxAdmins: 25,
          features: [
            'Unlimited employees',
            'White Label',
            'Multi-Branch',
            '24/7 Support',
            'Custom Integrations',
            'Dedicated Infrastructure',
          ],
          isActive: true,
          sortOrder: 4,
        },
      ];

      // Insert default plans into database
      const createdPlans = await Plan.insertMany(defaultPlans);
      
      return res.json({
        success: true,
        data: createdPlans.map(plan => plan.toObject()),
      });
    }

    return res.json({
      success: true,
      data: plans.map(plan => plan.toObject()),
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch plans.',
    });
  }
};

// Get plan analytics
const getPlanAnalytics = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const companies = await Company.find({
      ownerId,
      isDeleted: false,
    }).lean();

    const planStats = {};

    companies.forEach((company) => {
      const plan = company.subscription?.plan || 'free';
      if (!planStats[plan]) {
        planStats[plan] = {
          plan,
          revenue: 0,
          companies: 0,
        };
      }
      planStats[plan].revenue += company.subscription?.amount || 0;
      planStats[plan].companies += 1;
    });

    return res.json({
      success: true,
      data: Object.values(planStats),
    });
  } catch (error) {
    console.error('Error fetching plan analytics:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch plan analytics.',
    });
  }
};

// Create a new plan
const createPlan = async (req, res) => {
  try {
    const {
      name,
      key,
      price,
      maxEmployees,
      maxAdmins,
      features,
      description,
      billingCycle = 'yearly',
      sortOrder = 0,
    } = req.body;

    // Validation
    if (!name || !key || price === undefined || maxEmployees === undefined) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Name, key, price, and maxEmployees are required.',
      });
    }

    // Check if plan key already exists
    const existingPlan = await Plan.findOne({ key: key.toLowerCase() });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        code: 'PLAN_EXISTS',
        message: 'A plan with this key already exists.',
      });
    }

    // Check if plan name already exists
    const existingName = await Plan.findOne({ name: name.trim() });
    if (existingName) {
      return res.status(400).json({
        success: false,
        code: 'PLAN_NAME_EXISTS',
        message: 'A plan with this name already exists.',
      });
    }

    const plan = await Plan.create({
      name: name.trim(),
      key: key.toLowerCase().trim(),
      price: Number(price),
      maxEmployees: Number(maxEmployees),
      maxAdmins: Number(maxAdmins) || 1,
      features: features || [],
      description: description || '',
      billingCycle,
      sortOrder,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      data: plan,
      message: 'Plan created successfully.',
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to create plan.',
    });
  }
};

// Update a plan
const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    // Check for duplicate key if key is being updated
    if (updateData.key && updateData.key !== plan.key) {
      const existingKey = await Plan.findOne({ 
        key: updateData.key.toLowerCase(),
        _id: { $ne: id }
      });
      if (existingKey) {
        return res.status(400).json({
          success: false,
          code: 'PLAN_KEY_EXISTS',
          message: 'Another plan with this key already exists.',
        });
      }
    }

    // Check for duplicate name if name is being updated
    if (updateData.name && updateData.name !== plan.name) {
      const existingName = await Plan.findOne({ 
        name: updateData.name.trim(),
        _id: { $ne: id }
      });
      if (existingName) {
        return res.status(400).json({
          success: false,
          code: 'PLAN_NAME_EXISTS',
          message: 'Another plan with this name already exists.',
        });
      }
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'key',
      'price',
      'maxEmployees',
      'maxAdmins',
      'features',
      'description',
      'isActive',
      'billingCycle',
      'sortOrder',
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        if (field === 'key') {
          plan[field] = updateData[field].toLowerCase().trim();
        } else if (field === 'name') {
          plan[field] = updateData[field].trim();
        } else {
          plan[field] = updateData[field];
        }
      }
    });

    await plan.save();

    return res.json({
      success: true,
      data: plan,
      message: 'Plan updated successfully.',
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update plan.',
    });
  }
};

// Delete a plan (soft delete by setting isActive to false)
const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    // Check if any companies are using this plan
    const companiesUsingPlan = await Company.countDocuments({
      'subscription.plan': plan.key,
      isDeleted: false,
    });

    if (companiesUsingPlan > 0) {
      return res.status(400).json({
        success: false,
        code: 'PLAN_IN_USE',
        message: `Cannot delete plan. ${companiesUsingPlan} company/companies are currently using this plan.`,
      });
    }

    // Soft delete by deactivating
    plan.isActive = false;
    await plan.save();

    return res.json({
      success: true,
      message: 'Plan deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to delete plan.',
    });
  }
};

// Get single plan details
const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Plan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({
        success: false,
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    // Get companies using this plan
    const companiesCount = await Company.countDocuments({
      'subscription.plan': plan.key,
      isDeleted: false,
    });

    return res.json({
      success: true,
      data: {
        ...plan,
        companiesCount,
      },
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch plan details.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// SUPPORT TICKETS
// ═══════════════════════════════════════════════════════════

// Get all support tickets
const getSupportTickets = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const ownerId = req.user._id;

    // Get all companies for this owner
    const companies = await Company.find({
      ownerId,
      isDeleted: false,
    }).lean();

    const companyIds = companies.map((c) => c._id);

    const filter = { companyId: { $in: companyIds } };

    if (status && status !== 'All') {
      filter.status = status.toLowerCase();
    }

    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('companyId', 'name')
      .populate('raisedBy', 'name email')
      .lean();

    const total = await SupportTicket.countDocuments(filter);

    return res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch support tickets.',
    });
  }
};

// Update support ticket
const updateSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id;
    const { status, resolutionNotes } = req.body;

    // Get companies to verify ownership
    const companies = await Company.find({
      ownerId,
      isDeleted: false,
    }).lean();

    const companyIds = companies.map((c) => c._id);

    const ticket = await SupportTicket.findOne({
      _id: id,
      companyId: { $in: companyIds },
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found.',
      });
    }

    if (status) {
      ticket.status = status;
      if (status === 'resolved' || status === 'closed') {
        ticket.resolvedAt = new Date();
        ticket.resolutionNotes = resolutionNotes || ticket.resolutionNotes;
      }
    }

    await ticket.save();

    return res.json({
      success: true,
      data: ticket,
      message: 'Ticket updated successfully.',
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update ticket.',
    });
  }
};

// Get support analytics
const getSupportAnalytics = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const companies = await Company.find({
      ownerId,
      isDeleted: false,
    }).lean();

    const companyIds = companies.map((c) => c._id);

    const openTickets = await SupportTicket.countDocuments({
      companyId: { $in: companyIds },
      status: 'open',
    });

    const resolvedToday = await SupportTicket.countDocuments({
      companyId: { $in: companyIds },
      status: 'resolved',
      resolvedAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    });

    // Calculate average response time (mock for now)
    const avgResponseTime = '2.4 hrs';

    return res.json({
      success: true,
      data: {
        openTickets,
        resolvedToday,
        avgResponseTime,
      },
    });
  } catch (error) {
    console.error('Error fetching support analytics:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch support analytics.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// SETTINGS & PROFILE
// ═══════════════════════════════════════════════════════════

// Get owner profile
const getOwnerProfile = async (req, res) => {
  try {
    const owner = await User.findById(req.user._id)
      .select('-password -passwordResetToken -passwordResetExpires')
      .lean();

    return res.json({
      success: true,
      data: owner,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch profile.',
    });
  }
};

// Update owner profile
const updateOwnerProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const owner = await User.findById(req.user._id);

    if (!owner) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Owner not found.',
      });
    }

    if (name) owner.name = name;
    if (phone !== undefined) owner.phone = phone;

    // Check email uniqueness if changed
    if (email && email !== owner.email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_EXISTS',
          message: 'Email already in use.',
        });
      }
      owner.email = email.toLowerCase();
    }

    await owner.save();

    return res.json({
      success: true,
      data: {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
        role: owner.role,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update profile.',
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'New password must be at least 6 characters.',
      });
    }

    const owner = await User.findById(req.user._id);

    const isMatch = await bcrypt.compare(currentPassword, owner.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    owner.password = newPassword;
    await owner.save();

    return res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to change password.',
    });
  }
};

// Get settings
const getSettings = async (req, res) => {
  try {
    let settings = await OwnerSettings.findOne({
      ownerId: req.user._id,
    }).lean();

    if (!settings) {
      // Create default settings
      settings = await OwnerSettings.create({
        ownerId: req.user._id,
      });
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch settings.',
    });
  }
};

// Update settings
const updateSettings = async (req, res) => {
  try {
    const { platform, notifications, security } = req.body;

    let settings = await OwnerSettings.findOne({ ownerId: req.user._id });

    if (!settings) {
      settings = await OwnerSettings.create({ ownerId: req.user._id });
    }

    if (platform) {
      settings.platform = { ...settings.platform, ...platform };
    }

    if (notifications) {
      settings.notifications = { ...settings.notifications, ...notifications };
    }

    if (security) {
      settings.security = { ...settings.security, ...security };
    }

    await settings.save();

    return res.json({
      success: true,
      data: settings,
      message: 'Settings updated successfully.',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to update settings.',
    });
  }
};

// ═══════════════════════════════════════════════════════════
// INVOICE TEMPLATE
// ═══════════════════════════════════════════════════════════

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/invoice-template');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

// Get invoice template
const getInvoiceTemplate = async (req, res) => {
  try {
    const ownerId = req.user._id;
    
    let template = await InvoiceTemplate.findOne({ ownerId });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'No invoice template found. Please create one.',
      });
    }
    
    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error fetching invoice template:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice template.',
    });
  }
};

// Create invoice template
const createInvoiceTemplate = async (req, res) => {
  try {
    const ownerId = req.user._id;
    
    // Check if template already exists
    const existingTemplate = await InvoiceTemplate.findOne({ ownerId });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Invoice template already exists. Please update instead.',
      });
    }
    
    const template = new InvoiceTemplate({
      ownerId,
      ...req.body,
    });
    
    await template.save();
    
    return res.status(201).json({
      success: true,
      data: template,
      message: 'Invoice template created successfully.',
    });
  } catch (error) {
    console.error('Error creating invoice template:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create invoice template.',
    });
  }
};

// Update invoice template
const updateInvoiceTemplate = async (req, res) => {
  try {
    const ownerId = req.user._id;
    
    let template = await InvoiceTemplate.findOne({ ownerId });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'No invoice template found. Please create one first.',
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach((key) => {
      if (key === 'address' || key === 'bankDetails') {
        template[key] = { ...template[key], ...req.body[key] };
      } else {
        template[key] = req.body[key];
      }
    });
    
    await template.save();
    
    return res.json({
      success: true,
      data: template,
      message: 'Invoice template updated successfully.',
    });
  } catch (error) {
    console.error('Error updating invoice template:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update invoice template.',
    });
  }
};

// Upload logo
const uploadTemplateLogo = async (req, res) => {
  try {
    upload.single('logo')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded.',
        });
      }
      
      const fileUrl = `/uploads/invoice-template/${req.file.filename}`;
      
      return res.json({
        success: true,
        data: { url: fileUrl },
        message: 'Logo uploaded successfully.',
      });
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload logo.',
    });
  }
};

// Upload signature
const uploadTemplateSignature = async (req, res) => {
  try {
    upload.single('signature')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded.',
        });
      }
      
      const fileUrl = `/uploads/invoice-template/${req.file.filename}`;
      
      return res.json({
        success: true,
        data: { url: fileUrl },
        message: 'Signature uploaded successfully.',
      });
    });
  } catch (error) {
    console.error('Error uploading signature:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload signature.',
    });
  }
};

module.exports = {
  // Dashboard
  getOwnerDashboardAnalytics,
  // Company
  getOwnerCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  updateCompanySubscription,
  // Admin
  getCompanyAdmins,
  addCompanyAdmin,
  updateAdmin,
  deleteAdmin,
  // Billing
  getInvoices,
  getRevenueAnalytics,
  retryPayment,
  downloadInvoice,
  // Invoice Template
  getInvoiceTemplate,
  createInvoiceTemplate,
  updateInvoiceTemplate,
  uploadTemplateLogo,
  uploadTemplateSignature,
  // Plans
  getPlans,
  getPlanAnalytics,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanById,
  // Support
  getSupportTickets,
  updateSupportTicket,
  getSupportAnalytics,
  // Settings & Profile
  getOwnerProfile,
  updateOwnerProfile,
  changePassword,
  getSettings,
  updateSettings,
};



