const express = require('express');
const router = express.Router();
const {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getOfficeLocation
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

router.post('/checkin', protect, checkIn);
router.post('/checkout', protect, checkOut);
router.get('/today', protect, getTodayAttendance);
router.get('/history', protect, getAttendanceHistory);
router.get('/office-location', protect, getOfficeLocation);

module.exports = router;