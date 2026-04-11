const express = require('express');
const router = express.Router();
const {
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
  getLeaveTypes,
  addLeaveType,
  updateLeaveType,
  deleteLeaveType,
  grantYearlyLeaves,
  getEmployeeBalances,
  getAllLeaveRequests,
  updateLeaveStatus,
  getGrantStatus,
  allocateIndividualLeave,
  allocateLeave,
  getEmployeeLeaveCards,
  configureCarryForward,
  previewLeaveReset,
  executeLeaveReset,
  getResetHistory,
} = require('../controllers/leaveController');
const { protect, admin } = require('../middleware/authMiddleware');

// ─── Employee Routes ─────────────────────────────────────────────
router.post('/request', protect, submitLeaveRequest);
router.get('/my-requests', protect, getMyLeaveRequests);
router.delete('/request/:id', protect, cancelLeaveRequest);
router.get('/balances', protect, getEmployeeBalances);
router.get('/types', protect, getLeaveTypes);
router.get('/leave-cards-status', protect, getEmployeeLeaveCards);
router.get('/test-route', (req, res) => res.json({ success: true }));

// ─── Admin Routes ────────────────────────────────────────────────
router.post('/types', protect, admin, addLeaveType);
router.put('/types/:id', protect, admin, updateLeaveType);
router.delete('/types/:id', protect, admin, deleteLeaveType);
router.post('/grant-yearly', protect, admin, grantYearlyLeaves);
router.get('/admin/grant-status', protect, admin, getGrantStatus);
router.get('/admin/requests', protect, admin, getAllLeaveRequests);
router.put('/request/:id/status', protect, admin, updateLeaveStatus);
router.post('/allocate-individual', protect, admin, allocateIndividualLeave);
router.post('/allocations', protect, admin, allocateLeave);
router.get('/employee/:id/leave-cards', protect, admin, getEmployeeLeaveCards);

// ─── Leave Reset & Carry-Forward Routes ──────────────────────────
router.put('/admin/carry-forward-config/:leaveTypeId', protect, admin, configureCarryForward);
router.post('/admin/preview-reset', protect, admin, previewLeaveReset);
router.post('/admin/execute-reset', protect, admin, executeLeaveReset);
router.get('/admin/reset-history', protect, admin, getResetHistory);

module.exports = router;
