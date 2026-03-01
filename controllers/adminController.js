const User = require('../models/User');
const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const LeaveRequest = require('../models/LeaveRequest');
const Department = require('../models/Department');
const WeekOffConfig = require('../models/WeekOffConfig');
const { formatDate } = require('../utils/helpers');
const { generateToken } = require('../utils/helpers');

let statisticsCache = {
  data: null,
  expiresAt: 0,
};

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
      .select('-password')
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


const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({
      role: { $in: ['admin', 'manager'] },
    })
      .select('-password -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      admins,
    });
  } catch (error) {
    console.error('❌ Get admins error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


const createAdminAccount = async (req, res) => {
  try {
    const { name, email, password, department, role, position } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'name, email, password and role are required.',
      });
    }

    const normalizedRole =
      role === 'manager' || role === 'admin' ? role : 'admin';

    const existingEmail = await User.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      });
    }

    const adminUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      department: department?.trim() || '',
      position: position?.trim() || '',
      role: normalizedRole,
      isActive: true,
    });

    const adminResponse = await User.findById(adminUser._id)
      .select('-password -passwordResetToken -passwordResetExpires')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      admin: adminResponse,
    });
  } catch (error) {
    console.error('❌ Create admin error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


const updateAdminAccount = async (req, res) => {
  try {
    const { name, email, department, isActive, role, position } = req.body;

    const adminUser = await User.findById(req.params.id);

    if (!adminUser || !['admin', 'manager'].includes(adminUser.role)) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Admin account not found.',
      });
    }

    if (email && email.trim().toLowerCase() !== adminUser.email.toLowerCase()) {
      const existingEmail = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: adminUser._id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists.',
        });
      }
      adminUser.email = email.trim().toLowerCase();
    }

    if (name) {
      adminUser.name = name.trim();
    }
    if (department !== undefined) {
      adminUser.department = String(department).trim();
    }
    if (position !== undefined) {
      adminUser.position = String(position).trim();
    }
    if (typeof isActive === 'boolean') {
      adminUser.isActive = isActive;
    }
    if (role && ['admin', 'manager'].includes(role)) {
      adminUser.role = role;
    }

    await adminUser.save();

    const adminResponse = await User.findById(adminUser._id)
      .select('-password -passwordResetToken -passwordResetExpires')
      .lean();

    return res.json({
      success: true,
      message: 'Admin account updated successfully.',
      admin: adminResponse,
    });
  } catch (error) {
    console.error('❌ Update admin error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


const deleteAdminAccount = async (req, res) => {
  try {
    const adminUser = await User.findById(req.params.id);

    if (!adminUser || !['admin', 'manager'].includes(adminUser.role)) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Admin account not found.',
      });
    }

    await adminUser.deleteOne();

    return res.json({
      success: true,
      message: 'Admin account deleted successfully.',
    });
  } catch (error) {
    console.error('❌ Delete admin error:', error);
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
      .select('-password')
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
// @desc    Update an existing employee account
// @route   PUT /api/admin/employees/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const updateEmployeeDetails = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      employeeId,
      department,
      phone,
      position,
      isActive,
    } = req.body;

    const employee = await User.findById(req.params.id);

    if (!employee || employee.role !== 'employee') {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Employee not found.',
      });
    }

    if (
      email &&
      email.trim().toLowerCase() !== employee.email.toLowerCase()
    ) {
      const existingEmail = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: employee._id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists.',
        });
      }
      employee.email = email.trim().toLowerCase();
    }

    if (employeeId && employeeId.trim() !== employee.employeeId) {
      const existingEmpId = await User.findOne({
        employeeId: employeeId.trim(),
        _id: { $ne: employee._id },
      });
      if (existingEmpId) {
        return res.status(400).json({
          success: false,
          code: 'EMPLOYEE_ID_EXISTS',
          message: 'An account with this Employee ID already exists.',
        });
      }
      employee.employeeId = employeeId.trim();
    }

    if (name) {
      employee.name = name.trim();
    }
    if (department !== undefined) {
      employee.department = String(department).trim();
    }
    if (phone !== undefined) {
      employee.phone = String(phone).trim();
    }
    if (position !== undefined) {
      employee.position = String(position).trim();
    }
    if (typeof isActive === 'boolean') {
      employee.isActive = isActive;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 6 characters.',
        });
      }
      employee.password = password;
    }

    await employee.save();

    const employeeResponse = await User.findById(employee._id)
      .select('-password')
      .lean();

    return res.json({
      success: true,
      message: 'Employee updated successfully.',
      employee: employeeResponse,
    });
  } catch (error) {
    console.error('❌ Update employee error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Delete an employee account
// @route   DELETE /api/admin/employees/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const deleteEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);

    if (!employee || employee.role !== 'employee') {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Employee not found.',
      });
    }

    await Attendance.deleteMany({ userId: employee._id });
    await LeaveRequest.deleteMany({ userId: employee._id });

    await employee.deleteOne();

    return res.json({
      success: true,
      message: 'Employee deleted successfully.',
    });
  } catch (error) {
    console.error('❌ Delete employee error:', error);
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
// Body:    { name, email, password, employeeId, department, phone, position }
// ═════════════════════════════════════════════════════════════════
const createEmployee = async (req, res) => {
  try {
    const { name, email, password, employeeId, department, phone, position } =
      req.body;

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

    // ── 5. Create employee ────────────────────────────────────────
    const employee = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      employeeId: employeeId.trim(),
      department: department?.trim() || '',
      phone: phone?.trim() || '',
      position: position?.trim() || '',
      role: 'employee',
      isActive: true,
    });

    // Return employee without sensitive fields
    const employeeResponse = await User.findById(employee._id)
      .select('-password')
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
    const nowTs = Date.now();
    if (statisticsCache.data && statisticsCache.expiresAt > nowTs) {
      return res.json(statisticsCache.data);
    }

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
    const nowDate = new Date();
    const firstDayOfMonth = formatDate(
      new Date(nowDate.getFullYear(), nowDate.getMonth(), 1)
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

    const response = {
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
    };

    statisticsCache = {
      data: response,
      expiresAt: Date.now() + 30 * 1000,
    };

    return res.json(response);
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
// @desc    List all office locations
// @route   GET /api/admin/office-locations
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const listOfficeLocations = async (req, res) => {
  try {
    const items = await OfficeLocation.find({}).sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      officeLocations: items,
    });
  } catch (error) {
    console.error('❌ List office locations error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Create office location
// @route   POST /api/admin/office-locations
// @access  Private/Admin
// Body:    { name, latitude, longitude, radius, address, isActive? }
// ═════════════════════════════════════════════════════════════════
const createOfficeLocationItem = async (req, res) => {
  try {
    const { name, latitude, longitude, radius, address, isActive } = req.body;
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

    // Allow multiple active locations; do not auto-deactivate others
    // When isActive is true, mark only the created item as active without changing others.

    const created = await OfficeLocation.create({
      name: name || 'Office',
      location: {
        type: 'Point',
        coordinates: [Number(longitude), Number(latitude)],
      },
      radius: radius ? Number(radius) : 50,
      address: address || '',
      isActive: isActive === true,
    });

    return res.status(201).json({
      success: true,
      officeLocation: created,
    });
  } catch (error) {
    console.error('❌ Create office location error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Update office location by id
// @route   PUT /api/admin/office-locations/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const updateOfficeLocationById = async (req, res) => {
  try {
    const { name, latitude, longitude, radius, address, isActive } = req.body;
    const item = await OfficeLocation.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Office location not found.',
      });
    }
    if (latitude !== undefined && longitude !== undefined) {
      item.location.coordinates = [Number(longitude), Number(latitude)];
    }
    if (name !== undefined) item.name = String(name);
    if (radius !== undefined) item.radius = Number(radius);
    if (address !== undefined) item.address = String(address);
    if (isActive !== undefined) {
      item.isActive = Boolean(isActive);
      // Allow multiple active locations; do not auto-deactivate others
    }
    await item.save();
    return res.json({
      success: true,
      officeLocation: item,
    });
  } catch (error) {
    console.error('❌ Update office location by id error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Delete office location by id
// @route   DELETE /api/admin/office-locations/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const deleteOfficeLocationById = async (req, res) => {
  try {
    const item = await OfficeLocation.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Office location not found.',
      });
    }
    await OfficeLocation.deleteOne({ _id: item._id });
    return res.json({
      success: true,
      message: 'Office location deleted.',
    });
  } catch (error) {
    console.error('❌ Delete office location by id error:', error);
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


const getDepartments = async (req, res) => {
  try {
    const {
      search,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { manager: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && ['Active', 'Inactive'].includes(status)) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const totalCount = await Department.countDocuments(query);

    const departments = await Department.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const departmentsWithCounts = await Promise.all(
      departments.map(async (dept) => {
        const employeeCount = await User.countDocuments({
          role: 'employee',
          isActive: true,
          department: dept.name,
        });
        return { ...dept, employeeCount };
      })
    );

    return res.json({
      success: true,
      departments: departmentsWithCounts,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Get departments error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


const createDepartment = async (req, res) => {
  try {
    const { name, description, manager, status } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'name and description are required.',
      });
    }

    const trimmedName = String(name).trim();

    const existing = await Department.findOne({ name: trimmedName });
    if (existing) {
      return res.status(400).json({
        success: false,
        code: 'DEPARTMENT_EXISTS',
        message: 'A department with this name already exists.',
      });
    }

    const allowedStatus = ['Active', 'Inactive'];
    let finalStatus = 'Active';
    if (status && allowedStatus.includes(status)) {
      finalStatus = status;
    }

    const managerValue =
      manager !== undefined && String(manager).trim() !== ''
        ? String(manager).trim()
        : '';

    const department = await Department.create({
      name: trimmedName,
      description: String(description).trim(),
      manager: managerValue,
      status: finalStatus,
    });

    const employeeCount = await User.countDocuments({
      role: 'employee',
      isActive: true,
      department: department.name,
    });

    const departmentObject = department.toObject();

    return res.status(201).json({
      success: true,
      department: { ...departmentObject, employeeCount },
    });
  } catch (error) {
    console.error('❌ Create department error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


const updateDepartmentDetails = async (req, res) => {
  try {
    const { name, description, manager, status } = req.body;

    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Department not found.',
      });
    }

    if (name && name.trim() !== department.name) {
      const existing = await Department.findOne({ name: name.trim() });
      if (existing) {
        return res.status(400).json({
          success: false,
          code: 'DEPARTMENT_EXISTS',
          message: 'A department with this name already exists.',
        });
      }
      department.name = name.trim();
    }

    if (description !== undefined) {
      department.description = String(description).trim();
    }

    if (manager !== undefined) {
      department.manager = String(manager).trim();
    }

    if (status) {
      if (!['Active', 'Inactive'].includes(status)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_STATUS',
          message: 'status must be "Active" or "Inactive".',
        });
      }
      department.status = status;
    }

    await department.save();

    const employeeCount = await User.countDocuments({
      role: 'employee',
      isActive: true,
      department: department.name,
    });

    const departmentObject = department.toObject();

    return res.json({
      success: true,
      department: { ...departmentObject, employeeCount },
    });
  } catch (error) {
    console.error('❌ Update department error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Department not found.',
      });
    }

    const employeeCount = await User.countDocuments({
      role: 'employee',
      department: department.name,
    });

    if (employeeCount > 0) {
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_IN_USE',
        message: 'Cannot delete department while employees are assigned to it.',
        employeeCount,
      });
    }

    await department.deleteOne();

    return res.json({
      success: true,
      message: 'Department deleted successfully.',
    });
  } catch (error) {
    console.error('❌ Delete department error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

const getWeekOffConfig = async (req, res) => {
  try {
    let config = await WeekOffConfig.findOne().lean();
    if (!config) {
      config = await WeekOffConfig.create({ daysOfWeek: [0] });
      config = config.toObject();
    }
    return res.json({
      success: true,
      config: {
        daysOfWeek: Array.isArray(config.daysOfWeek) ? config.daysOfWeek : [],
      },
    });
  } catch (error) {
    console.error('❌ Get week off config error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

const updateWeekOffConfig = async (req, res) => {
  try {
    const { daysOfWeek } = req.body;

    if (!Array.isArray(daysOfWeek)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'daysOfWeek must be an array of numbers.',
      });
    }

    const validDays = daysOfWeek
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

    const uniqueDays = Array.from(new Set(validDays)).sort((a, b) => a - b);

    let config = await WeekOffConfig.findOne();
    if (!config) {
      config = await WeekOffConfig.create({ daysOfWeek: uniqueDays });
    } else {
      config.daysOfWeek = uniqueDays;
      await config.save();
    }

    return res.json({
      success: true,
      config: {
        daysOfWeek: config.daysOfWeek,
      },
    });
  } catch (error) {
    console.error('❌ Update week off config error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


module.exports = {
  getAdmins,
  createAdminAccount,
  updateAdminAccount,
  deleteAdminAccount,
  getAllEmployees,
  getEmployeeById,
  updateEmployeeDetails,
  createEmployee,
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
};
