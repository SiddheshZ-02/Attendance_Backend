const User = require('../models/User');
const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const LeaveRequest = require('../models/LeaveRequest');
const { formatDate } = require('../utils/helpers');
const { generateToken } = require('../utils/helpers');
const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────────────────────────────
// HELPER — format working hours number → "Xh YYm"
// ─────────────────────────────────────────────────────────────────
const formatHours = (decimalHours) => {
  if (!decimalHours) return '0h 00m';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get all employees (with optional search & filter)
// @route   GET /api/admin/employees
// @access  Private/Admin
// Query:   ?search=name|email  &department=  &isActive=true|false
//          &page=1  &limit=20
// ═════════════════════════════════════════════════════════════════
const getAllEmployees = async (req, res) => {
  try {
    const {
      search,
      department,
      isActive,
      page = 1,
      limit = 20,
    } = req.query;

    const query = { role: 'employee' };

    // ── Filters ───────────────────────────────────────────────────
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    if (department) query.department = department;

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // ── Pagination ────────────────────────────────────────────────
    const skip = (Number(page) - 1) * Number(limit);
    const totalCount = await User.countDocuments(query);

    const employees = await User.find(query)
      .select('-password -devices')
      .sort({ name: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      employees,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Get all employees error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get single employee details + attendance summary
// @route   GET /api/admin/employees/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const getEmployeeById = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id)
      .select('-password -devices')
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Employee not found.',
      });
    }

    // ── Attendance summary for current month ──────────────────────
    const now = new Date();
    const firstDayOfMonth = formatDate(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );

    const monthRecords = await Attendance.find({
      userId: req.params.id,
      date: { $gte: firstDayOfMonth },
    }).lean();

    const totalHours = monthRecords.reduce(
      (sum, r) => sum + (r.workingHours || 0),
      0
    );

    const attendanceSummary = {
      thisMonthDays: monthRecords.length,
      officeDays: monthRecords.filter((r) => r.workMode === 'Office').length,
      wfhDays: monthRecords.filter((r) => r.workMode === 'WFH').length,
      totalHours: formatHours(totalHours),
      avgHoursPerDay: formatHours(
        monthRecords.length > 0 ? totalHours / monthRecords.length : 0
      ),
    };

    // ── Pending leaves ────────────────────────────────────────────
    const pendingLeaves = await LeaveRequest.countDocuments({
      userId: req.params.id,
      status: 'pending',
    });

    return res.json({
      success: true,
      employee,
      attendanceSummary,
      pendingLeaves,
    });
  } catch (error) {
    console.error('❌ Get employee by ID error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Create a new employee account
// @route   POST /api/admin/employees
// @access  Private/Admin
// Body:    { name, email, password, employeeId, department, phone }
// ═════════════════════════════════════════════════════════════════
const createEmployee = async (req, res) => {
  try {
    const { name, email, password, employeeId, department, phone } = req.body;

    // ── 1. Validate required fields ───────────────────────────────
    if (!name || !email || !password || !employeeId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'name, email, password, and employeeId are required.',
      });
    }

    // ── 2. Email format validation ────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Please provide a valid email address.',
      });
    }

    // ── 3. Password length check ──────────────────────────────────
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      });
    }

    // ── 4. Duplicate checks ───────────────────────────────────────
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    const empIdExists = await User.findOne({ employeeId });
    if (empIdExists) {
      return res.status(400).json({
        success: false,
        code: 'EMPLOYEE_ID_EXISTS',
        message: 'An account with this Employee ID already exists.',
      });
    }

    // ── 5. Hash password ──────────────────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ── 6. Create employee ────────────────────────────────────────
    const employee = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      employeeId: employeeId.trim(),
      department: department?.trim() || '',
      phone: phone?.trim() || '',
      role: 'employee',
      isActive: true,
    });

    // Return employee without sensitive fields
    const employeeResponse = await User.findById(employee._id)
      .select('-password -devices')
      .lean();

    return res.status(201).json({
      success: true,
      message: `Employee "${employee.name}" created successfully.`,
      employee: employeeResponse,
    });
  } catch (error) {
    console.error('❌ Create employee error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Toggle employee active/inactive status
// @route   PUT /api/admin/employees/:id/toggle-status
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const toggleEmployeeStatus = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Employee not found.',
      });
    }

    if (employee.role === 'admin') {
      return res.status(400).json({
        success: false,
        code: 'CANNOT_MODIFY_ADMIN',
        message: 'Admin accounts cannot be deactivated from here.',
      });
    }

    // Prevent admin from deactivating themselves
    if (employee._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        code: 'CANNOT_MODIFY_SELF',
        message: 'You cannot change your own status.',
      });
    }

    employee.isActive = !employee.isActive;
    await employee.save();

    return res.json({
      success: true,
      message: `Employee "${employee.name}" has been ${employee.isActive ? 'activated' : 'deactivated'} successfully.`,
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    console.error('❌ Toggle employee status error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get all attendance records (admin view with pagination)
// @route   GET /api/admin/attendance
// @access  Private/Admin
// Query:   ?startDate=  &endDate=  &userId=  &workMode=Office|WFH
//          &page=1  &limit=50
// ═════════════════════════════════════════════════════════════════
const getAllAttendance = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      workMode,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};

    if (userId) query.userId = userId;
    if (workMode && ['Office', 'WFH'].includes(workMode)) {
      query.workMode = workMode;
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const totalCount = await Attendance.countDocuments(query);

    const attendanceRecords = await Attendance.find(query)
      .populate('userId', 'name email employeeId department')
      .sort({ checkInTime: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      records: attendanceRecords,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Get all attendance error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get dashboard statistics
// @route   GET /api/admin/statistics
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const getAttendanceStatistics = async (req, res) => {
  try {
    const today = formatDate(new Date());

    // ── Today's snapshot ──────────────────────────────────────────
    const todayRecords = await Attendance.find({ date: today }).lean();
    const totalEmployees = await User.countDocuments({
      role: 'employee',
      isActive: true,
    });

    const checkedInToday = todayRecords.filter(
      (a) => a.status === 'checked-in'
    ).length;
    const checkedOutToday = todayRecords.filter(
      (a) => a.status === 'checked-out'
    ).length;
    const officeTodayCount = todayRecords.filter(
      (a) => a.workMode === 'Office'
    ).length;
    const wfhTodayCount = todayRecords.filter(
      (a) => a.workMode === 'WFH'
    ).length;

    // ── This month ────────────────────────────────────────────────
    const now = new Date();
    const firstDayOfMonth = formatDate(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );

    const monthRecords = await Attendance.find({
      date: { $gte: firstDayOfMonth },
    }).lean();

    const totalWorkingHours = monthRecords.reduce(
      (sum, r) => sum + (r.workingHours || 0),
      0
    );
    const avgWorkingHours =
      monthRecords.length > 0 ? totalWorkingHours / monthRecords.length : 0;

    const officeMonthCount = monthRecords.filter(
      (r) => r.workMode === 'Office'
    ).length;
    const wfhMonthCount = monthRecords.filter(
      (r) => r.workMode === 'WFH'
    ).length;

    // ── Leave summary ─────────────────────────────────────────────
    const pendingLeaves = await LeaveRequest.countDocuments({
      status: 'pending',
    });
    const approvedLeaves = await LeaveRequest.countDocuments({
      status: 'approved',
    });

    return res.json({
      success: true,
      today: {
        totalEmployees,
        present: todayRecords.length,
        absent: totalEmployees - todayRecords.length,
        checkedIn: checkedInToday,
        checkedOut: checkedOutToday,
        inOffice: officeTodayCount,
        wfh: wfhTodayCount,
      },
      thisMonth: {
        totalAttendanceDays: monthRecords.length,
        officeDays: officeMonthCount,
        wfhDays: wfhMonthCount,
        totalHours: formatHours(totalWorkingHours),
        avgHoursPerDay: formatHours(avgWorkingHours),
      },
      leaves: {
        pending: pendingLeaves,
        approved: approvedLeaves,
      },
    });
  } catch (error) {
    console.error('❌ Get statistics error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Export attendance data as JSON (frontend generates CSV)
// @route   GET /api/admin/export
// @access  Private/Admin
// Query:   ?startDate=  &endDate=  &userId=  &workMode=Office|WFH
// ═════════════════════════════════════════════════════════════════
const exportAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, userId, workMode } = req.query;

    const query = {};
    if (userId) query.userId = userId;
    if (workMode && ['Office', 'WFH'].includes(workMode)) {
      query.workMode = workMode;
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('userId', 'name email employeeId department')
      .sort({ date: -1, checkInTime: -1 })
      .lean();

    // ── Format for CSV-ready export ───────────────────────────────
    const exportData = attendanceRecords.map((record) => ({
      employeeId: record.userId?.employeeId || '',
      name: record.userId?.name || '',
      email: record.userId?.email || '',
      department: record.userId?.department || '',
      date: record.date,
      workMode: record.workMode || '',
      checkInTime: record.checkInTime
        ? new Date(record.checkInTime).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '',
      checkOutTime: record.checkOutTime
        ? new Date(record.checkOutTime).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : 'Not checked out',
      workingHours: record.workingHours
        ? formatHours(record.workingHours)
        : '0h 00m',
      status: record.status,
    }));

    return res.json({
      success: true,
      message: 'Export data ready.',
      totalRecords: exportData.length,
      data: exportData,
    });
  } catch (error) {
    console.error('❌ Export attendance error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get office location (create default if not exists)
// @route   GET /api/admin/office-location
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const getOfficeLocation = async (req, res) => {
  try {
    let officeLocation = await OfficeLocation.findOne({ isActive: true });

    if (!officeLocation) {
      // Create a default — admin should update this immediately
      officeLocation = await OfficeLocation.create({
        name: 'Main Office',
        location: {
          type: 'Point',
          coordinates: [72.8856, 19.0748], // [lng, lat] — Diva, Maharashtra
        },
        radius: 50,
        address: 'Diva, Maharashtra, India',
        isActive: true,
      });
    }

    return res.json({
      success: true,
      officeLocation,
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


// ═════════════════════════════════════════════════════════════════
// @desc    Update office location
// @route   PUT /api/admin/office-location
// @access  Private/Admin
// Body:    { name, latitude, longitude, radius, address }
// ═════════════════════════════════════════════════════════════════
const updateOfficeLocation = async (req, res) => {
  try {
    const { name, latitude, longitude, radius, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_COORDINATES',
        message: 'latitude and longitude are required.',
      });
    }

    if (radius && (isNaN(radius) || Number(radius) < 10 || Number(radius) > 5000)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_RADIUS',
        message: 'radius must be a number between 10 and 5000 metres.',
      });
    }

    let officeLocation = await OfficeLocation.findOne({ isActive: true });

    if (officeLocation) {
      officeLocation.name = name || officeLocation.name;
      officeLocation.location.coordinates = [
        Number(longitude),
        Number(latitude),
      ];
      officeLocation.radius = radius ? Number(radius) : officeLocation.radius;
      officeLocation.address = address || officeLocation.address;
      await officeLocation.save();
    } else {
      officeLocation = await OfficeLocation.create({
        name: name || 'Main Office',
        location: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)],
        },
        radius: radius ? Number(radius) : 50,
        address: address || '',
        isActive: true,
      });
    }

    return res.json({
      success: true,
      message: 'Office location updated successfully.',
      officeLocation,
    });
  } catch (error) {
    console.error('❌ Update office location error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get all leave requests (admin view)
// @route   GET /api/admin/leave-requests
// @access  Private/Admin
// Query:   ?status=pending|approved|rejected|cancelled
//          &userId=  &page=1  &limit=20
// ═════════════════════════════════════════════════════════════════
const getLeaveRequests = async (req, res) => {
  try {
    const { status, userId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const skip = (Number(page) - 1) * Number(limit);
    const totalCount = await LeaveRequest.countDocuments(query);

    const leaveRequests = await LeaveRequest.find(query)
      .populate('userId', 'name email employeeId department')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      leaveRequests,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Get leave requests error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Approve or Reject a leave request
// @route   PUT /api/admin/leave-requests/:id
// @access  Private/Admin
// Body:    { status: 'approved'|'rejected', adminComment }
// ═════════════════════════════════════════════════════════════════
const updateLeaveRequest = async (req, res) => {
  try {
    const { status, adminComment } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_STATUS',
        message: 'status must be "approved" or "rejected".',
      });
    }

    const leaveRequest = await LeaveRequest.findById(req.params.id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Leave request not found.',
      });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_PROCESSED',
        message: `This leave request has already been ${leaveRequest.status}.`,
      });
    }

    leaveRequest.status = status;
    leaveRequest.approvedBy = req.user._id;
    leaveRequest.approvalDate = new Date();
    leaveRequest.adminComment = adminComment?.trim() || '';

    await leaveRequest.save();

    const updated = await LeaveRequest.findById(leaveRequest._id)
      .populate('userId', 'name email employeeId')
      .populate('approvedBy', 'name email')
      .lean();

    return res.json({
      success: true,
      message: `Leave request ${status} successfully.`,
      leaveRequest: updated,
    });
  } catch (error) {
    console.error('❌ Update leave request error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


module.exports = {
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
};