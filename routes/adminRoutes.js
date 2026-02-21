const express = require('express');
const router = express.Router();
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  toggleEmployeeStatus,
  getAllAttendance,
  getAttendanceStatistics,
  exportAttendanceReport,
  getOfficeLocation,
  updateOfficeLocation,
  getLeaveRequests,
  updateLeaveRequest,
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

// ─── Employee Routes ──────────────────────────────────────────────
// GET  /api/admin/employees          → list all (with search/filter/pagination)
// POST /api/admin/employees          → create new employee
// GET  /api/admin/employees/:id      → single employee + attendance summary
// PUT  /api/admin/employees/:id/toggle-status → activate / deactivate
router
  .route('/employees')
  .get(protect, admin, getAllEmployees)
  .post(protect, admin, createEmployee);

router.get('/employees/:id', protect, admin, getEmployeeById);
router.put('/employees/:id/toggle-status', protect, admin, toggleEmployeeStatus);

// ─── Attendance Routes ────────────────────────────────────────────
// GET /api/admin/attendance          → all records (filter + pagination)
// GET /api/admin/statistics          → dashboard stats
// GET /api/admin/export              → export-ready JSON
router.get('/attendance', protect, admin, getAllAttendance);
router.get('/statistics', protect, admin, getAttendanceStatistics);
router.get('/export', protect, admin, exportAttendanceReport);

// ─── Office Location Routes ───────────────────────────────────────
// GET /api/admin/office-location     → get current office location
// PUT /api/admin/office-location     → update office location
router
  .route('/office-location')
  .get(protect, admin, getOfficeLocation)
  .put(protect, admin, updateOfficeLocation);

// ─── Leave Request Routes ─────────────────────────────────────────
// GET /api/admin/leave-requests      → all leave requests (filter + pagination)
// PUT /api/admin/leave-requests/:id  → approve or reject
router.get('/leave-requests', protect, admin, getLeaveRequests);
router.put('/leave-requests/:id', protect, admin, updateLeaveRequest);

module.exports = router;