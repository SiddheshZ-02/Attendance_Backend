const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/ownerController');
const { protect, owner } = require('../middleware/authMiddleware');

// ═══════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════
router.get('/dashboard-analytics', protect, owner, getOwnerDashboardAnalytics);

// ═══════════════════════════════════════════════════════════
// Company Management
// ═══════════════════════════════════════════════════════════
router.get('/companies', protect, owner, getOwnerCompanies);
router.post('/companies', protect, owner, createCompany);
router.get('/companies/:id', protect, owner, getCompanyById);
router.put('/companies/:id', protect, owner, updateCompany);
router.delete('/companies/:id', protect, owner, deleteCompany);
router.put('/companies/:id/subscription', protect, owner, updateCompanySubscription);

// ═══════════════════════════════════════════════════════════
// Admin Management
// ═══════════════════════════════════════════════════════════
router.get('/companies/:id/admins', protect, owner, getCompanyAdmins);
router.post('/companies/:id/admins', protect, owner, addCompanyAdmin);
router.put('/companies/:id/admins/:adminId', protect, owner, updateAdmin);
router.delete('/companies/:id/admins/:adminId', protect, owner, deleteAdmin);

// ═══════════════════════════════════════════════════════════
// Billing & Invoices
// ═══════════════════════════════════════════════════════════
router.get('/billing/invoices', protect, owner, getInvoices);
router.get('/billing/revenue-analytics', protect, owner, getRevenueAnalytics);
router.post('/billing/invoices/:id/retry', protect, owner, retryPayment);
router.get('/billing/invoices/:id/download', protect, owner, downloadInvoice);

// ═══════════════════════════════════════════════════════════
// Plans
// ═══════════════════════════════════════════════════════════
router.get('/plans', protect, owner, getPlans);
router.get('/plans/analytics', protect, owner, getPlanAnalytics);
router.get('/plans/:id', protect, owner, getPlanById);
router.post('/plans', protect, owner, createPlan);
router.put('/plans/:id', protect, owner, updatePlan);
router.delete('/plans/:id', protect, owner, deletePlan);

// ═══════════════════════════════════════════════════════════
// Support Tickets
// ═══════════════════════════════════════════════════════════
router.get('/support/tickets', protect, owner, getSupportTickets);
router.put('/support/tickets/:id', protect, owner, updateSupportTicket);
router.get('/support/analytics', protect, owner, getSupportAnalytics);

// ═══════════════════════════════════════════════════════════
// Settings & Profile
// ═══════════════════════════════════════════════════════════
router.get('/profile', protect, owner, getOwnerProfile);
router.put('/profile', protect, owner, updateOwnerProfile);
router.put('/profile/password', protect, owner, changePassword);
router.get('/settings', protect, owner, getSettings);
router.put('/settings', protect, owner, updateSettings);

module.exports = router;
