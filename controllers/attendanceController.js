const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const WeekOffConfig = require('../models/WeekOffConfig');
const { calculateDistance, formatDate, calculateWorkingHours } = require('../utils/helpers');

// ─────────────────────────────────────────────────────────────────
// HELPER — format a Date object → "HH:MM" (24-hr) string
// ─────────────────────────────────────────────────────────────────
const formatTime = (date) => {
  if (!date) return '--:--';
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

// ─────────────────────────────────────────────────────────────────
// HELPER — format working hours number → "Xh YYm" string
// e.g.  8.5  →  "8h 30m"
// ─────────────────────────────────────────────────────────────────
const formatHours = (decimalHours) => {
  if (!decimalHours && decimalHours !== 0) return '--:--';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

// ─────────────────────────────────────────────────────────────────
// HELPER — build the stats object the frontend expects
// ─────────────────────────────────────────────────────────────────
const buildStats = (attendance) => ({
  firstCheckIn: formatTime(attendance?.checkInTime),
  lastCheckOut: formatTime(attendance?.checkOutTime),
  totalHours: attendance?.workingHours
    ? formatHours(attendance.workingHours)
    : '--:--',
});


// ═════════════════════════════════════════════════════════════════
// @desc    Check In
// @route   POST /api/attendance/checkin
// @access  Private
// Body:    { latitude, longitude, workMode }
// ═════════════════════════════════════════════════════════════════
const checkIn = async (req, res) => {
  try {
    const { latitude, longitude, workMode } = req.body;

    // ── 1. Validate required fields ───────────────────────────────
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_LOCATION',
        message: 'Location coordinates are required.',
      });
    }

    if (!workMode || !['Office', 'WFH'].includes(workMode)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_WORK_MODE',
        message: 'workMode must be either "Office" or "WFH".',
      });
    }

    // ── 2. Prevent duplicate check-in for the same day ────────────
    const today = formatDate(new Date());

    const existingAttendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message:
          existingAttendance.status === 'checked-out'
            ? 'You have already completed your attendance for today.'
            : 'You are already checked in for today.',
        attendance: existingAttendance,
        stats: buildStats(existingAttendance),
      });
    }

    // ── 3. OFFICE MODE — validate distance from office ─────────────
    if (workMode === 'Office') {
      const officeLocation = await OfficeLocation.findOne({ isActive: true });

      if (!officeLocation) {
        return res.status(404).json({
          success: false,
          code: 'OFFICE_NOT_CONFIGURED',
          message: 'Office location is not configured. Please contact admin.',
        });
      }

      const officeLat = officeLocation.location.coordinates[1];
      const officeLng = officeLocation.location.coordinates[0];

      const distance = calculateDistance(latitude, longitude, officeLat, officeLng);

      if (distance > officeLocation.radius) {
        return res.status(400).json({
          success: false,
          code: 'OUT_OF_OFFICE_RADIUS',
          message: `You are ${Math.round(distance)}m away from the office. You must be within ${officeLocation.radius}m to check in.`,
          distance: Math.round(distance),
          allowedRadius: officeLocation.radius,
        });
      }
    }

    // ── 4. WFH MODE — no distance check, just capture location ────
    // The captured checkInLocation becomes the checkout anchor later.

    // ── 5. Create attendance record ───────────────────────────────
    const attendance = await Attendance.create({
      userId: req.user._id,
      workMode,
      checkInTime: new Date(),
      checkInLocation: {
        type: 'Point',
        coordinates: [longitude, latitude], // GeoJSON: [lng, lat]
      },
      date: today,
      status: 'checked-in',
      // WFH checkout radius — stored immutably at check-in time
      wfhCheckoutRadius: 100,
    });

    return res.status(201).json({
      success: true,
      message: `Checked in successfully (${workMode}).`,
      attendance,
      stats: buildStats(attendance),
    });
  } catch (error) {
    console.error('❌ Check-in error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Check Out
// @route   POST /api/attendance/checkout
// @access  Private
// Body:    { latitude, longitude }
// ═════════════════════════════════════════════════════════════════
const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    // ── 1. Validate coordinates ───────────────────────────────────
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_LOCATION',
        message: 'Location coordinates are required.',
      });
    }

    // ── 2. Find today's check-in record ───────────────────────────
    const today = formatDate(new Date());

    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });

    if (!attendance) {
      return res.status(400).json({
        success: false,
        code: 'NOT_CHECKED_IN',
        message: 'You have not checked in today.',
      });
    }

    if (attendance.status === 'checked-out') {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_OUT',
        message: 'You have already checked out today.',
        attendance,
        stats: buildStats(attendance),
      });
    }

    // ── 3. OFFICE MODE — validate distance from office ─────────────
    if (attendance.workMode === 'Office') {
      const officeLocation = await OfficeLocation.findOne({ isActive: true });

      if (!officeLocation) {
        return res.status(404).json({
          success: false,
          code: 'OFFICE_NOT_CONFIGURED',
          message: 'Office location is not configured. Please contact admin.',
        });
      }

      const officeLat = officeLocation.location.coordinates[1];
      const officeLng = officeLocation.location.coordinates[0];

      const distance = calculateDistance(latitude, longitude, officeLat, officeLng);

      if (distance > officeLocation.radius) {
        return res.status(400).json({
          success: false,
          code: 'OUT_OF_OFFICE_RADIUS',
          message: `You are ${Math.round(distance)}m away from the office. You must be within ${officeLocation.radius}m to check out.`,
          distance: Math.round(distance),
          allowedRadius: officeLocation.radius,
        });
      }
    }

    // ── 4. WFH MODE — validate distance from check-in location ────
    if (attendance.workMode === 'WFH') {
      // The anchor is the location where the user checked in
      const checkInLat = attendance.checkInLocation.coordinates[1];
      const checkInLng = attendance.checkInLocation.coordinates[0];

      const distance = calculateDistance(latitude, longitude, checkInLat, checkInLng);

      const allowedRadius = attendance.wfhCheckoutRadius || 100;

      if (distance > allowedRadius) {
        return res.status(400).json({
          success: false,
          code: 'OUT_OF_WFH_RADIUS',
          message: `You are ${Math.round(distance)}m away from your check-in location. You must be within ${allowedRadius}m to check out.`,
          distance: Math.round(distance),
          allowedRadius,
        });
      }
    }

    // ── 5. Save check-out ─────────────────────────────────────────
    attendance.checkOutTime = new Date();
    attendance.checkOutLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };
    attendance.workingHours = calculateWorkingHours(
      attendance.checkInTime,
      attendance.checkOutTime
    );
    attendance.status = 'checked-out';

    await attendance.save();

    return res.json({
      success: true,
      message: `Checked out successfully. You worked ${formatHours(attendance.workingHours)} today.`,
      attendance,
      stats: buildStats(attendance),
    });
  } catch (error) {
    console.error('❌ Check-out error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get today's attendance status + stats
// @route   GET /api/attendance/today
// @access  Private
// ═════════════════════════════════════════════════════════════════
const getTodayAttendance = async (req, res) => {
  try {
    const today = formatDate(new Date());

    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: today,
    });

    return res.json({
      success: true,
      attendance: attendance || null,
      hasCheckedIn: !!attendance,
      hasCheckedOut: attendance?.status === 'checked-out',
      workMode: attendance?.workMode || null,
      stats: buildStats(attendance),
    });
  } catch (error) {
    console.error('❌ Get today attendance error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get attendance history with statistics
// @route   GET /api/attendance/history
// @access  Private
// Query:   ?period=week|month|day  OR  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ═════════════════════════════════════════════════════════════════
const getAttendanceHistory = async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;

    let dateFilter = {};

    // ── Build date filter ─────────────────────────────────────────
    if (startDate && endDate) {
      // Explicit range takes priority
      dateFilter = { $gte: startDate, $lte: endDate };
    } else {
      const now = new Date();

      if (period === 'day') {
        dateFilter = formatDate(now);
      } else if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = { $gte: formatDate(weekAgo) };
      } else if (period === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        dateFilter = { $gte: formatDate(monthAgo) };
      } else {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PERIOD',
          message: 'period must be one of: day, week, month.',
        });
      }
    }

    const query = {
      userId: req.user._id,
      date: dateFilter,
    };

    const attendanceRecords = await Attendance.find(query)
      .sort({ checkInTime: -1 })
      .limit(100)
      .lean(); // lean() for better performance — returns plain JS objects

    // ── Statistics ────────────────────────────────────────────────
    const totalDays = attendanceRecords.length;

    const totalHoursDecimal = attendanceRecords.reduce(
      (sum, r) => sum + (r.workingHours || 0),
      0
    );

    const officeDays = attendanceRecords.filter((r) => r.workMode === 'Office').length;
    const wfhDays = attendanceRecords.filter((r) => r.workMode === 'WFH').length;

    const avgHoursDecimal = totalDays > 0 ? totalHoursDecimal / totalDays : 0;

    return res.json({
      success: true,
      records: attendanceRecords,
      statistics: {
        totalDays,
        officeDays,
        wfhDays,
        totalHours: formatHours(totalHoursDecimal),
        avgHoursPerDay: formatHours(avgHoursDecimal),
      },
    });
  } catch (error) {
    console.error('❌ Get attendance history error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

const getAttendanceCalendar = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let rangeStart;
    let rangeEnd;

    if (startDate && endDate) {
      rangeStart = startDate;
      rangeEnd = endDate;
    } else {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      rangeStart = formatDate(first);
      rangeEnd = formatDate(last);
    }

    const weekOffConfig = await WeekOffConfig.findOne().lean();
    const weekOffDays = Array.isArray(weekOffConfig?.daysOfWeek)
      ? weekOffConfig.daysOfWeek
      : [0];

    const attendanceRecords = await Attendance.find({
      userId: req.user._id,
      date: { $gte: rangeStart, $lte: rangeEnd },
    })
      .sort({ date: 1 })
      .lean();

    const recordsByDate = new Map();
    attendanceRecords.forEach((r) => {
      recordsByDate.set(String(r.date), r);
    });

    const days = [];
    let presentDays = 0;
    let leaveDays = 0;
    let weekOffDaysCount = 0;
    let totalHoursDecimal = 0;

    const cursor = new Date(rangeStart);
    const end = new Date(rangeEnd);

    while (cursor <= end) {
      const dateStr = formatDate(cursor);
      const weekday = cursor.getDay();
      const record = recordsByDate.get(dateStr);

      let status;
      let workMode = null;
      let checkInTime = null;
      let checkOutTime = null;
      let workingHours = 0;

      if (record) {
        status = 'Present';
        workMode = record.workMode || null;
        checkInTime = record.checkInTime || null;
        checkOutTime = record.checkOutTime || null;
        workingHours = record.workingHours || 0;
        presentDays += 1;
        totalHoursDecimal += workingHours;
      } else if (weekOffDays.includes(weekday)) {
        status = 'Week Off';
        weekOffDaysCount += 1;
      } else {
        status = 'Leave';
        leaveDays += 1;
      }

      days.push({
        date: dateStr,
        status,
        workMode,
        checkInTime,
        checkOutTime,
        workingHours,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const statistics = {
      presentDays,
      leaveDays,
      weekOffDays: weekOffDaysCount,
      totalHours: formatHours(totalHoursDecimal),
    };

    return res.json({
      success: true,
      days,
      statistics,
    });
  } catch (error) {
    console.error('❌ Get attendance calendar error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get office location for user reference
// @route   GET /api/attendance/office-location
// @access  Private
// ═════════════════════════════════════════════════════════════════
const getOfficeLocation = async (req, res) => {
  try {
    const officeLocation = await OfficeLocation.findOne({ isActive: true });

    if (!officeLocation) {
      return res.status(404).json({
        success: false,
        code: 'OFFICE_NOT_CONFIGURED',
        message: 'Office location is not configured. Please contact admin.',
      });
    }

    return res.json({
      success: true,
      officeLocation: {
        name: officeLocation.name,
        address: officeLocation.address,
        location: officeLocation.location,
        radius: officeLocation.radius,
      },
    });
  } catch (error) {
    console.error('❌ Get office location error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


module.exports = {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getOfficeLocation,
  getAttendanceCalendar,
};
