const LeaveRequest = require('../models/LeaveRequest');

// ═════════════════════════════════════════════════════════════════
// @desc    Submit a new leave request
// @route   POST /api/leave/request
// @access  Private (Employee)
// Body:    { startDate, endDate, reason, leaveType }
// ═════════════════════════════════════════════════════════════════
const submitLeaveRequest = async (req, res) => {
  try {
    const { startDate, endDate, reason, leaveType } = req.body;

    // ── 1. Validate required fields ───────────────────────────────
    if (!startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'startDate, endDate, and reason are required.',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // ── 2. Date logic validation ──────────────────────────────────
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DATE',
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DATE_RANGE',
        message: 'End date must be on or after start date.',
      });
    }

    // Cannot apply for leave in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      return res.status(400).json({
        success: false,
        code: 'PAST_DATE',
        message: 'Cannot apply for leave on past dates.',
      });
    }

    // ── 3. Overlap check — block if dates clash with existing leave ─
    // Check for any pending/approved leave that overlaps with requested range
    const overlapping = await LeaveRequest.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'approved'] },
      $or: [
        // existing leave starts inside requested range
        { startDate: { $gte: start, $lte: end } },
        // existing leave ends inside requested range
        { endDate: { $gte: start, $lte: end } },
        // existing leave fully wraps requested range
        { startDate: { $lte: start }, endDate: { $gte: end } },
      ],
    });

    if (overlapping) {
      return res.status(400).json({
        success: false,
        code: 'OVERLAPPING_LEAVE',
        message: `You already have a ${overlapping.status} leave request from 
          ${overlapping.startDate.toDateString()} to ${overlapping.endDate.toDateString()}. 
          Please cancel it first or choose different dates.`,
        conflictingLeave: {
          id: overlapping._id,
          startDate: overlapping.startDate,
          endDate: overlapping.endDate,
          status: overlapping.status,
        },
      });
    }

    // ── 4. Create leave request ───────────────────────────────────
    // totalDays is auto-calculated via pre-save hook in the model
    const leaveRequest = await LeaveRequest.create({
      userId: req.user._id,
      startDate: start,
      endDate: end,
      reason: reason.trim(),
      leaveType: leaveType || 'casual',
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully.',
      leaveRequest,
    });
  } catch (error) {
    console.error('❌ Submit leave request error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Get logged-in user's leave requests
// @route   GET /api/leave/my-requests
// @access  Private (Employee)
// Query:   ?status=pending|approved|rejected|cancelled
// ═════════════════════════════════════════════════════════════════
const getMyLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const query = { userId: req.user._id };
    if (status) {
      if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_STATUS',
          message: 'status must be one of: pending, approved, rejected, cancelled.',
        });
      }
      query.status = status;
    }

    const leaveRequests = await LeaveRequest.find(query)
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // ── Summary stats ─────────────────────────────────────────────
    const all = await LeaveRequest.find({ userId: req.user._id }).lean();
    const summary = {
      total: all.length,
      pending: all.filter((r) => r.status === 'pending').length,
      approved: all.filter((r) => r.status === 'approved').length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      totalApprovedDays: all
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + (r.totalDays || 0), 0),
    };

    return res.json({
      success: true,
      leaveRequests,
      summary,
    });
  } catch (error) {
    console.error('❌ Get my leave requests error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════
// @desc    Cancel a pending leave request
// @route   DELETE /api/leave/request/:id
// @access  Private (Employee — only own requests)
// ═════════════════════════════════════════════════════════════════
const cancelLeaveRequest = async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Leave request not found.',
      });
    }

    // ── Ownership check ───────────────────────────────────────────
    if (leaveRequest.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'You are not authorized to cancel this request.',
      });
    }

    // ── Only pending requests can be cancelled ────────────────────
    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        code: 'CANNOT_CANCEL',
        message: `Only pending requests can be cancelled. This request is already ${leaveRequest.status}.`,
      });
    }

    // Soft-cancel: mark as cancelled instead of deleting (better for audit trail)
    leaveRequest.status = 'cancelled';
    await leaveRequest.save();

    return res.json({
      success: true,
      message: 'Leave request cancelled successfully.',
      leaveRequest,
    });
  } catch (error) {
    console.error('❌ Cancel leave request error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};


module.exports = {
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
};