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
  getGrantStatus
} = require('../controllers/leaveController');
const { protect, admin } = require('../middleware/authMiddleware');

// ─── Employee Routes ─────────────────────────────────────────────
router.post('/request', protect, submitLeaveRequest);
router.get('/my-requests', protect, getMyLeaveRequests);
router.delete('/request/:id', protect, cancelLeaveRequest);
router.get('/balances', protect, getEmployeeBalances);
router.get('/types', protect, getLeaveTypes);

// ─── Admin Routes ────────────────────────────────────────────────
router.post('/types', protect, admin, addLeaveType);
router.put('/types/:id', protect, admin, updateLeaveType);
router.delete('/types/:id', protect, admin, deleteLeaveType);
router.post('/grant-yearly', protect, admin, grantYearlyLeaves);
router.get('/admin/grant-status', protect, admin, getGrantStatus);
router.get('/admin/requests', protect, admin, getAllLeaveRequests);
router.put('/request/:id/status', protect, admin, updateLeaveStatus);

module.exports = router;
