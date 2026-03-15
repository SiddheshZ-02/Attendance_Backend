const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const EmployeeLeaveBalance = require('../models/EmployeeLeaveBalance');
const User = require('../models/User');

// ═════════════════════════════════════════════════════════════════
// @desc    Submit a new leave request
// @route   POST /api/leave/request
// @access  Private (Employee)
// Body:    { startDate, endDate, reason, leaveTypeId }
// ═════════════════════════════════════════════════════════════════
const submitLeaveRequest = async (req, res) => {
  try {
    const { startDate, endDate, reason, leaveTypeId, payType, isHalfDay, totalDays } = req.body;

    if (totalDays === undefined || !startDate || !endDate || !reason || !leaveTypeId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Required fields are missing (startDate, endDate, reason, leaveTypeId, totalDays).'
      });
    }

    if (typeof totalDays !== 'number' || totalDays <= 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TOTAL_DAYS',
        message: 'totalDays must be a positive number.'
      });
    }

    const isHalfDayBool = isHalfDay === true || isHalfDay === 'true';
    if (isHalfDayBool && totalDays !== 0.5) {
      return res.status(400).json({
        success: false,
        code: 'HALF_DAY_MISMATCH',
        message: `For a half-day leave, totalDays must be 0.5, but received ${totalDays}.`
      });
    }

    const type = await LeaveType.findById(leaveTypeId);
    if (!type || !type.isActive) {
      return res.status(400).json({ success: false, code: 'INVALID_LEAVE_TYPE', message: 'Invalid or inactive leave type.' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const currentYear = start.getFullYear().toString();

    if (payType === 'paid') {
      const balance = await EmployeeLeaveBalance.findOne({ userId: req.user._id, leaveTypeId, year: currentYear });
      if (!balance || balance.remainingDays < totalDays) {
        return res.status(400).json({
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient leave balance. Available: ${balance ? balance.remainingDays : 0} days.`
        });
      }
    }

    const overlapping = await LeaveRequest.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'approved'] },
      $or: [
        { startDate: { $gte: start, $lte: end } },
        { endDate: { $gte: start, $lte: end } },
        { startDate: { $lte: start }, endDate: { $gte: end } },
      ],
    });

    if (overlapping) {
      return res.status(400).json({
        success: false,
        code: 'OVERLAPPING_LEAVE',
        message: `You already have a ${overlapping.status} leave request for these dates.`
      });
    }

    const leaveRequest = await LeaveRequest.create({
      userId: req.user._id,
      companyId: req.user.companyId || null,
      startDate: start,
      endDate: end,
      isHalfDay: isHalfDayBool,
      reason: reason.trim(),
      leaveType: type.name,
      leaveTypeId,
      payType: payType?.toLowerCase() || 'paid',
      status: 'pending',
      totalDays, // Directly use the validated totalDays from the request
    });

    return res.status(201).json({ success: true, message: 'Leave request submitted successfully.', leaveRequest });

  } catch (error) {
    console.error('❌ Submit leave request error:', error);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Something went wrong.' });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Get logged-in user's leave requests
// @route   GET /api/leave/my-requests
// @access  Private (Employee)
// ═════════════════════════════════════════════════════════════════
const getMyLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      userId: req.user._id,
      companyId: req.user.companyId || null,
    };
    if (status) query.status = status;

    const leaveRequests = await LeaveRequest.find(query)
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const all = await LeaveRequest.find({
      userId: req.user._id,
      companyId: req.user.companyId || null,
    }).lean();

    const summary = {
      total: all.length,
      pending: all.filter((r) => r.status === 'pending').length,
      approved: all.filter((r) => r.status === 'approved').length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      totalApprovedDays: all
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + (r.totalDays || 0), 0),
    };

    return res.json({ success: true, leaveRequests, summary });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Cancel a pending leave request
// @route   DELETE /api/leave/request/:id
// @access  Private (Employee)
// ═════════════════════════════════════════════════════════════════
const cancelLeaveRequest = async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) return res.status(404).json({ success: false, message: 'Not found' });
    if (leaveRequest.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending can be cancelled' });
    }
    leaveRequest.status = 'cancelled';
    await leaveRequest.save();
    return res.json({ success: true, message: 'Cancelled', leaveRequest });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ═════════════════════════════════════════════════════════════════
// ADMIN FUNCTIONS
// ═════════════════════════════════════════════════════════════════

const getLeaveTypes = async (req, res) => {
  try {
    const types = await LeaveType.find({ companyId: req.user.companyId });
    return res.json({ success: true, leaveTypes: types });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching leave types' });
  }
};

const addLeaveType = async (req, res) => {
  try {
    const { name, yearlyCount } = req.body;
    const type = await LeaveType.create({
      name,
      yearlyCount,
      companyId: req.user.companyId,
    });
    return res.status(201).json({ success: true, leaveType: type });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error adding leave type' });
  }
};

const updateLeaveType = async (req, res) => {
  try {
    const type = await LeaveType.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json({ success: true, leaveType: type });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating leave type' });
  }
};

const grantYearlyLeaves = async (req, res) => {
  try {
    const { year, employeeIds } = req.body;
    const activeTypes = await LeaveType.find({ companyId: req.user.companyId, isActive: true });

    let grantedCount = 0;
    let skippedCount = 0;

    for (const empId of employeeIds) {
      const prevYear = (parseInt(year) - 1).toString();
      await EmployeeLeaveBalance.updateMany(
        { userId: empId, year: prevYear, status: 'active' },
        { status: 'expired' }
      );

      for (const type of activeTypes) {
        const exists = await EmployeeLeaveBalance.findOne({
          userId: empId,
          leaveTypeId: type._id,
          year,
          status: 'active',
        });

        if (exists) {
          skippedCount++;
          continue;
        }

        await EmployeeLeaveBalance.create({
          userId: empId,
          leaveTypeId: type._id,
          year,
          allocatedDays: type.yearlyCount,
          remainingDays: type.yearlyCount,
          companyId: req.user.companyId,
        });
        grantedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Granted ${grantedCount} balances, skipped ${skippedCount}.`,
    });
  } catch (error) {
    console.error('❌ Grant yearly leaves error:', error);
    return res.status(500).json({ success: false, message: 'Error granting leaves' });
  }
};

const getEmployeeBalances = async (req, res) => {
  try {
    const { userId, year } = req.query;
    const balances = await EmployeeLeaveBalance.find({
      userId: userId || req.user._id,
      year: year || new Date().getFullYear().toString(),
    }).populate('leaveTypeId', 'name');

    return res.json({ success: true, balances });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching balances' });
  }
};

const getAllLeaveRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const query = { companyId: req.user.companyId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const users = await User.find({ 
        $or: [{ name: searchRegex }, { email: searchRegex }, { employeeId: searchRegex }],
        companyId: req.user.companyId
      }).select('_id');
      
      const userIds = users.map(u => u._id);
      query.userId = { $in: userIds };
    }

    const requests = await LeaveRequest.find(query)
      .populate('userId', 'name email employeeId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await LeaveRequest.countDocuments(query);

    return res.json({ 
      success: true, 
      requests, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (error) {
    console.error('Get all leave requests error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateLeaveStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const { id } = req.params;

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Leave is already ${leaveRequest.status}` });
    }

    leaveRequest.status = status;
    leaveRequest.approvedBy = req.user._id;
    if (status === 'rejected') {
      leaveRequest.rejectionReason = rejectionReason;
    }

    if (status === 'approved' && leaveRequest.payType === 'paid') {
      const year = new Date(leaveRequest.startDate).getFullYear().toString();
      const balance = await EmployeeLeaveBalance.findOne({
        userId: leaveRequest.userId,
        leaveTypeId: leaveRequest.leaveTypeId,
        year: year,
      });

      if (balance && balance.remainingDays >= leaveRequest.totalDays) {
        balance.remainingDays -= leaveRequest.totalDays;
        await balance.save();
      } else {
        return res.status(400).json({ success: false, message: 'Insufficient balance to approve' });
      }
    }

    await leaveRequest.save();
    return res.json({ success: true, message: `Leave ${status}` });
  } catch (error) {
    console.error('Update leave status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
  getLeaveTypes,
  addLeaveType,
  updateLeaveType,
  grantYearlyLeaves,
  getEmployeeBalances,
  getAllLeaveRequests,
  updateLeaveStatus,
};
