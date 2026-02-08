const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const { calculateDistance, formatDate, calculateWorkingHours } = require('../utils/helpers');

// @desc    Check in
// @route   POST /api/attendance/checkin
// @access  Private
const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }

    // Get active office location
    const officeLocation = await OfficeLocation.findOne({ isActive: true });
    if (!officeLocation) {
      return res.status(404).json({ message: 'Office location not configured' });
    }

    // Calculate distance from office
    const distance = calculateDistance(
      latitude,
      longitude,
      officeLocation.location.coordinates[1],
      officeLocation.location.coordinates[0]
    );

    // Check if within radius
    if (distance > officeLocation.radius) {
      return res.status(400).json({
        message: `You are ${Math.round(distance)}m away from office. Please be within ${officeLocation.radius}m radius.`,
        distance: Math.round(distance),
        allowedRadius: officeLocation.radius
      });
    }

    // Check if already checked in today
    const today = formatDate(new Date());
    const existingAttendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
      status: 'checked-in'
    });

    if (existingAttendance) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    // Create attendance record
    const attendance = await Attendance.create({
      userId: req.user._id,
      checkInTime: new Date(),
      checkInLocation: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      date: today,
      status: 'checked-in'
    });

    res.status(201).json({
      message: 'Checked in successfully',
      attendance
    });
  } catch (error) {
    console.error('Check in error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Check out
// @route   POST /api/attendance/checkout
// @access  Private
const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }

    // Find today's attendance
    const today = formatDate(new Date());
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
      status: 'checked-in'
    });

    if (!attendance) {
      return res.status(400).json({ message: 'No check-in record found for today' });
    }

    // Get office location
    const officeLocation = await OfficeLocation.findOne({ isActive: true });
    if (!officeLocation) {
      return res.status(404).json({ message: 'Office location not configured' });
    }

    // Calculate distance from office
    const distance = calculateDistance(
      latitude,
      longitude,
      officeLocation.location.coordinates[1],
      officeLocation.location.coordinates[0]
    );

    // Check if within radius
    if (distance > officeLocation.radius) {
      return res.status(400).json({
        message: `You are ${Math.round(distance)}m away from office. Please be within ${officeLocation.radius}m radius.`,
        distance: Math.round(distance),
        allowedRadius: officeLocation.radius
      });
    }

    // Update attendance
    attendance.checkOutTime = new Date();
    attendance.checkOutLocation = {
      type: 'Point',
      coordinates: [longitude, latitude]
    };
    attendance.workingHours = calculateWorkingHours(attendance.checkInTime, attendance.checkOutTime);
    attendance.status = 'checked-out';

    await attendance.save();

    res.json({
      message: 'Checked out successfully',
      attendance
    });
  } catch (error) {
    console.error('Check out error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private
const getTodayAttendance = async (req, res) => {
  try {
    const today = formatDate(new Date());
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today
    });

    res.json({
      attendance: attendance || null,
      hasCheckedIn: !!attendance,
      hasCheckedOut: attendance ? attendance.status === 'checked-out' : false
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get attendance history
// @route   GET /api/attendance/history
// @access  Private
const getAttendanceHistory = async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;
    
    let query = { userId: req.user._id };
    
    // Calculate date range
    if (startDate && endDate) {
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    } else {
      const now = new Date();
      let start;
      
      if (period === 'day') {
        start = formatDate(now);
        query.date = start;
      } else if (period === 'week') {
        start = new Date(now.setDate(now.getDate() - 7));
        query.date = { $gte: formatDate(start) };
      } else if (period === 'month') {
        start = new Date(now.setDate(now.getDate() - 30));
        query.date = { $gte: formatDate(start) };
      }
    }

    const attendanceRecords = await Attendance.find(query)
      .sort({ checkInTime: -1 })
      .limit(100);

    // Calculate statistics
    const totalDays = attendanceRecords.length;
    const totalHours = attendanceRecords.reduce((sum, record) => sum + (record.workingHours || 0), 0);
    const avgHours = totalDays > 0 ? (totalHours / totalDays).toFixed(2) : 0;

    res.json({
      records: attendanceRecords,
      statistics: {
        totalDays,
        totalHours: totalHours.toFixed(2),
        avgHours
      }
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory
};