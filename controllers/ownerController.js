const Company = require('../models/Company');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Activity = require('../models/Activity');

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

const getOwnerDashboardAnalytics = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const companies = await Company.find({ ownerId }).lean();

    if (!companies.length) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalCompanies: 0,
            totalAdmins: 0,
            totalEmployees: 0,
            monthlyRecurringRevenue: 0,
            activeSubscriptions: 0,
            upcomingRenewals30: 0,
            upcomingRenewals60: 0,
            upcomingRenewals90: 0,
            failedPayments: 0,
          },
          admins: [],
          subscriptions: [],
          revenueSeries: [],
          transactions: [],
          employeeGrowthSeries: [],
          subscriptionConversion: {
            totalCompanies: 0,
            paidCompanies: 0,
            conversionRate: 0,
          },
          adminActivityHeatmap: [],
          featureFlags: [],
          serviceTiers: [],
          capacity: {
            totalEmployeeCapacity: 0,
            usedEmployeeCapacity: 0,
            projectedIn90Days: 0,
          },
        },
      });
    }

    const companyIds = companies.map((c) => c._id);

    const admins = await User.find({
      companyId: { $in: companyIds },
      role: { $in: ['admin', 'manager'] },
    })
      .select('-password -passwordResetToken -passwordResetExpires')
      .lean();

    const employees = await User.find({
      companyId: { $in: companyIds },
      role: 'employee',
    })
      .select('_id companyId createdAt')
      .lean();

    const adminIds = admins.map((a) => a._id);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAdminActivities = adminIds.length
      ? await Activity.find({
          userId: { $in: adminIds },
          timestamp: { $gte: thirtyDaysAgo },
        })
          .select('userId type timestamp date')
          .lean()
      : [];

    const activityByAdmin = new Map();
    const approvalsByAdmin = new Map();
    const activityByDate = new Map();

    for (const activity of recentAdminActivities) {
      const adminKey = String(activity.userId);
      activityByAdmin.set(
        adminKey,
        (activityByAdmin.get(adminKey) || 0) + 1
      );

      if (activity.type === 'leave-approved') {
        approvalsByAdmin.set(
          adminKey,
          (approvalsByAdmin.get(adminKey) || 0) + 1
        );
      }

      const dateKey = activity.date;
      if (!activityByDate.has(dateKey)) {
        activityByDate.set(dateKey, {
          date: dateKey,
          activeAdmins: new Set(),
          totalActions: 0,
        });
      }
      const entry = activityByDate.get(dateKey);
      entry.activeAdmins.add(adminKey);
      entry.totalActions += 1;
    }

    const employeeByCompany = new Map();
    for (const emp of employees) {
      const companyKey = String(emp.companyId);
      employeeByCompany.set(
        companyKey,
        (employeeByCompany.get(companyKey) || 0) + 1
      );
    }

    const adminMetrics = admins.map((admin) => {
      const adminKey = String(admin._id);
      const companyKey = String(admin.companyId);
      const employeeCount = employeeByCompany.get(companyKey) || 0;
      const activityCount = activityByAdmin.get(adminKey) || 0;
      const approvals = approvalsByAdmin.get(adminKey) || 0;

      const lastLoginAt = admin.lastLoginAt || admin.updatedAt || admin.createdAt;

      const scoreBase = Math.min(activityCount, 100);
      const approvalBonus = Math.min(approvals * 5, 40);
      const activityScore = Math.min(scoreBase + approvalBonus, 100);

      const company = companies.find(
        (c) => String(c._id) === companyKey
      );

      return {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        companyId: admin.companyId,
        companyName: company ? company.name : '',
        isActive: admin.isActive,
        lastLoginAt,
        employeeCount,
        activityScore,
        approvalsLast30d: approvals,
      };
    });

    const months = [];
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const current = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        label: `${monthLabels[d.getMonth()]} ${d.getFullYear()}`,
      });
    }

    const employeeGrowthMap = new Map();
    for (const emp of employees) {
      const created = emp.createdAt instanceof Date ? emp.createdAt : new Date(emp.createdAt);
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      employeeGrowthMap.set(
        key,
        (employeeGrowthMap.get(key) || 0) + 1
      );
    }

    const employeeGrowthSeries = [];
    let cumulative = 0;
    for (const m of months) {
      const added = employeeGrowthMap.get(m.key) || 0;
      cumulative += added;
      employeeGrowthSeries.push({
        month: m.key,
        label: m.label,
        employees: cumulative,
      });
    }

    const planPrices = {
      free: 0,
      starter: 49,
      standard: 99,
      premium: 199,
      enterprise: 299,
    };

    const subscriptions = companies.map((company) => {
      const plan = company.plan || 'free';
      const price = planPrices[plan] ?? 0;
      const startedAt = company.createdAt || now;
      const renewal = new Date(startedAt);
      renewal.setFullYear(renewal.getFullYear() + 1);

      const daysUntilRenewal = Math.floor(
        (renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const alerts = {
        is30Day: daysUntilRenewal <= 30 && daysUntilRenewal >= 0,
        is60Day: daysUntilRenewal > 30 && daysUntilRenewal <= 60,
        is90Day: daysUntilRenewal > 60 && daysUntilRenewal <= 90,
      };

      const status =
        price === 0 ? 'trial' : daysUntilRenewal < 0 ? 'past_due' : 'active';

      return {
        companyId: company._id,
        companyName: company.name,
        plan,
        status,
        startedAt,
        renewalDate: renewal,
        daysUntilRenewal,
        amount: price,
        currency: 'USD',
        alerts,
      };
    });

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === 'active'
    );

    let upcomingRenewals30 = 0;
    let upcomingRenewals60 = 0;
    let upcomingRenewals90 = 0;

    for (const sub of activeSubscriptions) {
      if (sub.alerts.is30Day) upcomingRenewals30 += 1;
      else if (sub.alerts.is60Day) upcomingRenewals60 += 1;
      else if (sub.alerts.is90Day) upcomingRenewals90 += 1;
    }

    const revenueSeries = months.map((m) => {
      const revenueForMonth = subscriptions.reduce((sum, sub) => {
        const start = sub.startedAt instanceof Date ? sub.startedAt : new Date(sub.startedAt);
        if (
          start.getFullYear() < m.year ||
          (start.getFullYear() === m.year && start.getMonth() <= m.monthIndex)
        ) {
          return sum + sub.amount;
        }
        return sum;
      }, 0);

      return {
        month: m.key,
        label: m.label,
        revenue: revenueForMonth,
      };
    });

    const monthlyRecurringRevenue = activeSubscriptions.reduce(
      (sum, sub) => sum + sub.amount,
      0
    );

    const transactions = [];
    let txIndex = 1;
    for (const sub of subscriptions) {
      if (sub.amount === 0) continue;
      const txDate = new Date(now.getFullYear(), now.getMonth(), Math.max(1, Math.min(28, txIndex)));
      const failed = txIndex % 7 === 0;
      transactions.push({
        id: `tx_${txIndex}`,
        companyId: sub.companyId,
        companyName: sub.companyName,
        date: txDate,
        amount: sub.amount,
        currency: sub.currency,
        status: failed ? 'failed' : 'paid',
        type: 'subscription',
        reference: `INV-${txDate.getFullYear()}${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(
          txIndex
        ).padStart(4, '0')}`,
        canRetry: failed,
      });
      txIndex += 1;
    }

    const failedPayments = transactions.filter((t) => t.status === 'failed').length;

    const adminActivityHeatmap = [];
    const heatmapDays = 30;
    for (let i = heatmapDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = activityByDate.get(key);
      adminActivityHeatmap.push({
        date: key,
        activeAdmins: entry ? entry.activeAdmins.size : 0,
        totalActions: entry ? entry.totalActions : 0,
      });
    }

    const totalCompanies = companies.length;
    const paidCompanies = subscriptions.filter((s) => s.amount > 0).length;
    const conversionRate =
      totalCompanies === 0
        ? 0
        : Math.round((paidCompanies / totalCompanies) * 100);

    const subscriptionConversion = {
      totalCompanies,
      paidCompanies,
      conversionRate,
    };

    const baseTiers = [
      { key: 'free', name: 'Free', maxEmployees: 25, maxAdmins: 1, price: planPrices.free },
      { key: 'starter', name: 'Starter', maxEmployees: 100, maxAdmins: 3, price: planPrices.starter },
      { key: 'standard', name: 'Standard', maxEmployees: 250, maxAdmins: 5, price: planPrices.standard },
      { key: 'premium', name: 'Premium', maxEmployees: 1000, maxAdmins: 10, price: planPrices.premium },
      { key: 'enterprise', name: 'Enterprise', maxEmployees: 5000, maxAdmins: 25, price: planPrices.enterprise },
    ];

    const serviceTiers = baseTiers.map((tier) => ({
      ...tier,
      currency: 'USD',
    }));

    const featureFlags = [
      {
        key: 'beta-mobile-owner-dashboard',
        name: 'Mobile Owner Dashboard',
        description: 'Expose owner analytics APIs for mobile clients',
        enabled: true,
        tier: 'standard',
      },
      {
        key: 'advanced-financial-analytics',
        name: 'Advanced Financial Analytics',
        description: 'Enable revenue breakdowns and recovery workflows',
        enabled: true,
        tier: 'premium',
      },
      {
        key: 'capacity-planning',
        name: 'Capacity Planning',
        description: 'Forecast employee capacity across all companies',
        enabled: true,
        tier: 'standard',
      },
    ];

    const capacityPerCompany = 250;
    const totalEmployeeCapacity = companies.length * capacityPerCompany;
    const usedEmployeeCapacity = employees.length;

    const attendanceSamples = await Attendance.find({
      companyId: { $in: companyIds },
      date: {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .slice(0, 10),
      },
    })
      .select('workingHours')
      .limit(1000)
      .lean();

    const avgGrowthFactor =
      attendanceSamples.length > 0 ? 1 + Math.min(attendanceSamples.length / 1000, 0.15) : 1.05;

    const projectedIn90Days = Math.round(
      Math.min(totalEmployeeCapacity, usedEmployeeCapacity * avgGrowthFactor)
    );

    const summary = {
      totalCompanies,
      totalAdmins: admins.length,
      totalEmployees: employees.length,
      monthlyRecurringRevenue,
      activeSubscriptions: activeSubscriptions.length,
      upcomingRenewals30,
      upcomingRenewals60,
      upcomingRenewals90,
      failedPayments,
    };

    return res.json({
      success: true,
      data: {
        summary,
        admins: adminMetrics,
        subscriptions,
        revenueSeries,
        transactions,
        employeeGrowthSeries,
        subscriptionConversion,
        adminActivityHeatmap,
        featureFlags,
        serviceTiers,
        capacity: {
          totalEmployeeCapacity,
          usedEmployeeCapacity,
          projectedIn90Days,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Failed to fetch owner dashboard analytics.',
    });
  }
};

module.exports = {
  createCompany,
  getOwnerCompanies,
  getCompanyAdmins,
  getOwnerDashboardAnalytics,
};
