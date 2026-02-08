const User = require('../models/User');
const Attendance = require('../models/Attendance');
const OfficeLocation = require('../models/OfficeLocation');
const LeaveRequest = require('../models/LeaveRequest');
const { formatDate } = require('../utils/helpers');

// @desc    Get all employees
// @route   GET /api/admin/employees
// @access  Private/Admin
const getAllEmployees = async (req, res) => {
  try {
    const employees = await User.find({ role: 'employee' }).select('-password');
    res.json(employees);
  } catch (error) {
    console.error('Get all employees error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all attendance records
// @route   GET /api/admin/attendance
// @access  Private/Admin
const getAllAttendance = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    let query = {};
    
    if (userId) {
      query.userId = userId;
    }
    
    if (startDate && endDate) {
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('userId', 'name email employeeId department')
      .sort({ checkInTime: -1 })
      .limit(500);

    res.json(attendanceRecords);
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get attendance statistics
// @route   GET /api/admin/statistics
// @access  Private/Admin
const getAttendanceStatistics = async (req, res) => {
  try {
    const today = formatDate(new Date());
    
    // Today's attendance
    const todayAttendance = await Attendance.find({ date: today });
    const checkedInToday = todayAttendance.filter(a => a.status === 'checked-in').length;
    const checkedOutToday = todayAttendance.filter(a => a.status === 'checked-out').length;
    
    // Total employees
    const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });
    
    // This month's statistics
    const now = new Date();
    const firstDayOfMonth = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthAttendance = await Attendance.find({
      date: { $gte: firstDayOfMonth }
    });
    
    const totalWorkingHours = monthAttendance.reduce((sum, record) => sum + (record.workingHours || 0), 0);
    const avgWorkingHours = monthAttendance.length > 0 ? (totalWorkingHours / monthAttendance.length).toFixed(2) : 0;

    // Pending leave requests
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });

    res.json({
      today: {
        totalEmployees,
        checkedIn: checkedInToday,
        checkedOut: checkedOutToday,
        absent: totalEmployees - todayAttendance.length
      },
      thisMonth: {
        totalAttendanceDays: monthAttendance.length,
        totalWorkingHours: totalWorkingHours.toFixed(2),
        avgWorkingHours
      },
      pendingLeaveRequests: pendingLeaves
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Export attendance report
// @route   GET /api/admin/export
// @access  Private/Admin
const exportAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    let query = {};
    
    if (userId) {
      query.userId = userId;
    }
    
    if (startDate && endDate) {
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('userId', 'name email employeeId department')
      .sort({ checkInTime: -1 });

    // Format data for CSV export
    const csvData = attendanceRecords.map(record => ({
      employeeId: record.userId.employeeId,
      name: record.userId.name,
      email: record.userId.email,
      department: record.userId.department,
      date: record.date,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime || 'Not checked out',
      workingHours: record.workingHours || 0,
      status: record.status
    }));

    res.json({
      message: 'Export data generated',
      data: csvData,
      totalRecords: csvData.length
    });
  } catch (error) {
    console.error('Export attendance error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get or Create office location
// @route   GET /api/admin/office-location
// @access  Private/Admin
const getOfficeLocation = async (req, res) => {
  try {
    let officeLocation = await OfficeLocation.findOne({ isActive: true });
    
    // Create default office location if not exists (Diva, India)
    if (!officeLocation) {
      officeLocation = await OfficeLocation.create({
        name: 'Home',
        location: {
          type: 'Point',
          coordinates: [72.050573, 19.182175] // [longitude, latitude] - Diva
        },
        radius: 50,
        address: 'Diva, Maharashtra, India',
        isActive: true
      });
    }

    res.json(officeLocation);
  } catch (error) {
    console.error('Get office location error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update office location
// @route   PUT /api/admin/office-location
// @access  Private/Admin
const updateOfficeLocation = async (req, res) => {
  try {
    const { name, latitude, longitude, radius, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude required' });
    }

    let officeLocation = await OfficeLocation.findOne({ isActive: true });

    if (officeLocation) {
      officeLocation.name = name || officeLocation.name;
      officeLocation.location.coordinates = [longitude, latitude];
      officeLocation.radius = radius || officeLocation.radius;
      officeLocation.address = address || officeLocation.address;
      
      await officeLocation.save();
    } else {
      officeLocation = await OfficeLocation.create({
        name: name || 'Main Office',
        location: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        radius: radius || 50,
        address: address || '',
        isActive: true
      });
    }

    res.json({
      message: 'Office location updated successfully',
      officeLocation
    });
  } catch (error) {
    console.error('Update office location error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all leave requests
// @route   GET /api/admin/leave-requests
// @access  Private/Admin
const getLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }

    const leaveRequests = await LeaveRequest.find(query)
      .populate('userId', 'name email employeeId department')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(leaveRequests);
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Approve/Reject leave request
// @route   PUT /api/admin/leave-requests/:id
// @access  Private/Admin
const updateLeaveRequest = async (req, res) => {
  try {
    const { status, adminComment } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use approved or rejected' });
    }

    const leaveRequest = await LeaveRequest.findById(req.params.id);

    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Leave request already processed' });
    }

    leaveRequest.status = status;
    leaveRequest.approvedBy = req.user._id;
    leaveRequest.approvalDate = new Date();
    leaveRequest.adminComment = adminComment || '';

    await leaveRequest.save();

    const populatedLeaveRequest = await LeaveRequest.findById(leaveRequest._id)
      .populate('userId', 'name email employeeId')
      .populate('approvedBy', 'name email');

    res.json({
      message: `Leave request ${status} successfully`,
      leaveRequest: populatedLeaveRequest
    });
  } catch (error) {
    console.error('Update leave request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Toggle employee active status
// @route   PUT /api/admin/employees/:id/toggle-status
// @access  Private/Admin
const toggleEmployeeStatus = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (employee.role === 'admin') {
      return res.status(400).json({ message: 'Cannot modify admin status' });
    }

    employee.isActive = !employee.isActive;
    await employee.save();

    res.json({
      message: `Employee ${employee.isActive ? 'activated' : 'deactivated'} successfully`,
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        isActive: employee.isActive
      }
    });
  } catch (error) {
    console.error('Toggle employee status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllEmployees,
  getAllAttendance,
  getAttendanceStatistics,
  exportAttendanceReport,
  getOfficeLocation,
  updateOfficeLocation,
  getLeaveRequests,
  updateLeaveRequest,
  toggleEmployeeStatus
};
