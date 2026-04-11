const express = require('express');
const router = express.Router();
const {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getOfficeLocation,
  getAttendanceCalendar,
  manualAttendanceEntry,
  updateCheckOutTime,
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

router.post('/checkin', protect, checkIn);
router.post('/checkout', protect, checkOut);
router.get('/today', protect, getTodayAttendance);
router.get('/history', protect, getAttendanceHistory);
router.get('/calendar', protect, getAttendanceCalendar);
router.get('/office-location', protect, getOfficeLocation);
router.post('/manual-entry', protect, manualAttendanceEntry);
router.put('/update-checkout', protect, updateCheckOutTime);

module.exports = router;
