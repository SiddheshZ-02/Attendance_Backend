const express = require('express');
const router = express.Router();
const {
  getAllEmployees,
  getEmployeeById,
  updateEmployeeDetails,
  createEmployee,
  getAdmins,
  createAdminAccount,
  updateAdminAccount,
  deleteAdminAccount,
  toggleEmployeeStatus,
  deleteEmployee,
  getAllAttendance,
  getAttendanceStatistics,
  exportAttendanceReport,
  getOfficeLocation,
  updateOfficeLocation,
  listOfficeLocations,
  createOfficeLocationItem,
  updateOfficeLocationById,
  deleteOfficeLocationById,
  getLeaveRequests,
  updateLeaveRequest,
  getDepartments,
  createDepartment,
  updateDepartmentDetails,
  deleteDepartment,
  getWeekOffConfig,
  updateWeekOffConfig,
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

// ─── Admin User Routes ────────────────────────────────────────────
// GET  /api/admin/admins            → list all admin/manager accounts
// POST /api/admin/admins            → create new admin/manager
// PUT  /api/admin/admins/:id        → update admin/manager
// DELETE /api/admin/admins/:id      → delete admin/manager
router
  .route('/admins')
  .get(protect, admin, getAdmins)
  .post(protect, admin, createAdminAccount);

router
  .route('/admins/:id')
  .put(protect, admin, updateAdminAccount)
  .delete(protect, admin, deleteAdminAccount);

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
router.put('/employees/:id', protect, admin, updateEmployeeDetails);
router.delete('/employees/:id', protect, admin, deleteEmployee);
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

// Multi-location management
router
  .route('/office-locations')
  .get(protect, admin, listOfficeLocations)
  .post(protect, admin, createOfficeLocationItem);

router
  .route('/office-locations/:id')
  .put(protect, admin, updateOfficeLocationById)
  .delete(protect, admin, deleteOfficeLocationById);

// ─── Leave Request Routes ─────────────────────────────────────────
// GET /api/admin/leave-requests      → all leave requests (filter + pagination)
// PUT /api/admin/leave-requests/:id  → approve or reject
router.get('/leave-requests', protect, admin, getLeaveRequests);
router.put('/leave-requests/:id', protect, admin, updateLeaveRequest);

router
  .route('/departments')
  .get(protect, admin, getDepartments)
  .post(protect, admin, createDepartment);

router
  .route('/departments/:id')
  .put(protect, admin, updateDepartmentDetails)
  .delete(protect, admin, deleteDepartment);

router
  .route('/weekoff')
  .get(protect, admin, getWeekOffConfig)
  .put(protect, admin, updateWeekOffConfig);

module.exports = router;
