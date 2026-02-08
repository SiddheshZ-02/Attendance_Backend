const express = require('express');
const router = express.Router();
const {
  getAllEmployees,
  getAllAttendance,
  getAttendanceStatistics,
  exportAttendanceReport,
  getOfficeLocation,
  updateOfficeLocation,
  getLeaveRequests,
  updateLeaveRequest,
  toggleEmployeeStatus
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/employees', protect, admin, getAllEmployees);
router.get('/attendance', protect, admin, getAllAttendance);
router.get('/statistics', protect, admin, getAttendanceStatistics);
router.get('/export', protect, admin, exportAttendanceReport);
router.route('/office-location')
  .get(protect, admin, getOfficeLocation)
  .put(protect, admin, updateOfficeLocation);
router.get('/leave-requests', protect, admin, getLeaveRequests);
router.put('/leave-requests/:id', protect, admin, updateLeaveRequest);
router.put('/employees/:id/toggle-status', protect, admin, toggleEmployeeStatus);

module.exports = router;