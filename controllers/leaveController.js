const mongoose = require('mongoose');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const EmployeeLeaveBalance = require('../models/EmployeeLeaveBalance');
const LeaveAllocation = require('../models/LeaveAllocation');
const LeaveResetLog = require('../models/LeaveResetLog');
const User = require('../models/User');
const { logActivity } = require('../utils/helpers');

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
      // 1. Check yearly EmployeeLeaveBalance
      const balance = await EmployeeLeaveBalance.findOne({ userId: req.user._id, leaveTypeId, year: currentYear });
      const yearlyRemaining = balance ? balance.remainingDays : 0;

      // 2. Check active non-expired LeaveAllocation (allocation-based grants from admin)
      const now = new Date();
      const activeAllocations = await LeaveAllocation.aggregate([
        {
          $match: {
            userId: req.user._id,
            leaveTypeId: new mongoose.Types.ObjectId(leaveTypeId),
            status: 'active',
            expiresAt: { $gt: now },
          },
        },
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: { $subtract: ['$daysAllocated', '$daysUsed'] } },
          },
        },
      ]);
      const allocationRemaining = activeAllocations.length > 0 ? activeAllocations[0].totalAvailable : 0;

      const totalAvailable = yearlyRemaining + allocationRemaining;

      if (totalAvailable < totalDays) {
        return res.status(400).json({
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient leave balance. Available: ${totalAvailable} days (yearly: ${yearlyRemaining}, allocated: ${allocationRemaining}).`
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

const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const leaveType = await LeaveType.findById(id);

    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    // Optional: Check if leave type is being used in any leave requests or balances
    const inUseRequests = await LeaveRequest.exists({ leaveTypeId: id });
    const inUseBalances = await EmployeeLeaveBalance.exists({ leaveTypeId: id });

    if (inUseRequests || inUseBalances) {
      // Instead of hard delete, we could just deactivate it
      leaveType.isActive = false;
      await leaveType.save();
      return res.json({ 
        success: true, 
        message: 'Leave type is in use, so it has been deactivated instead of deleted.' 
      });
    }

    await LeaveType.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Leave type deleted successfully' });
  } catch (error) {
    console.error('Delete leave type error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const grantYearlyLeaves = async (req, res) => {
  try {
    const { year, employeeIds } = req.body;

    if (!year || !employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request. year and employeeIds array are required.' 
      });
    }

    const activeTypes = await LeaveType.find({ companyId: req.user.companyId, isActive: true });
    
    if (activeTypes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No active leave types found. Please create leave types first.' 
      });
    }

    console.log(`\n🎯 ========== GRANT YEARLY LEAVES ==========`);
    console.log(`🎯 Year: ${year}`);
    console.log(`🎯 Employees: ${employeeIds.length}`);
    console.log(`📋 Active leave types:`, activeTypes.map(t => `${t.name} (${t.yearlyCount} days)`));
    console.log(`🏢 Company ID: ${req.user.companyId}`);
    console.log(`👤 Admin: ${req.user.email}`);

    let grantedCount = 0;
    let skippedCount = 0;
    const processedEmployees = [];
    const failedEmployees = [];

    for (const empId of employeeIds) {
      try {
        const empResult = {
          employeeId: empId,
          grantedTypes: [],
          skippedTypes: [],
          error: null
        };

        console.log(`\n👤 Processing employee: ${empId}`);

        const prevYear = (parseInt(year) - 1).toString();
        const expiredResult = await EmployeeLeaveBalance.updateMany(
          { userId: empId, year: prevYear, status: 'active', companyId: req.user.companyId },
          { status: 'expired' }
        );
        
        if (expiredResult.modifiedCount > 0) {
          console.log(`   ⏰ Expired ${expiredResult.modifiedCount} balances from ${prevYear}`);
        }

        for (const type of activeTypes) {
          console.log(`   📝 Checking ${type.name}...`);
          
          const existingBalance = await EmployeeLeaveBalance.findOne({
            userId: empId,
            leaveTypeId: type._id,
            year,
            companyId: req.user.companyId,
          });

          if (existingBalance) {
            skippedCount++;
            empResult.skippedTypes.push(type.name);
            console.log(`   ⏭️  Skipped - Already exists (status: ${existingBalance.status})`);
            continue;
          }

          console.log(`   ✅ Creating new balance for ${type.name}...`);
          
          const newBalance = await EmployeeLeaveBalance.create({
            userId: empId,
            leaveTypeId: type._id,
            year,
            allocatedDays: type.yearlyCount,
            remainingDays: type.yearlyCount,
            companyId: req.user.companyId,
            status: 'active',
          });
          
          console.log(`   ✅ Created: ${newBalance.allocatedDays} days allocated, ${newBalance.remainingDays} remaining`);
          
          grantedCount++;
          empResult.grantedTypes.push(type.name);
        }

        processedEmployees.push(empResult);
        console.log(`   ✅ Employee ${empId} completed: ${empResult.grantedTypes.length} granted, ${empResult.skippedTypes.length} skipped`);
      } catch (empError) {
        console.error(`\n❌ ERROR processing employee ${empId}:`, {
          message: empError.message,
          code: empError.code,
          name: empError.name
        });
        
        failedEmployees.push({
          employeeId: empId,
          error: empError.message || 'Unknown error',
          errorCode: empError.code,
        });
      }
    }

    const result = {
      success: true,
      message: `Processed ${employeeIds.length} employee(s)`,
      grantedCount,
      skippedCount,
      processedCount: processedEmployees.length,
      failedCount: failedEmployees.length,
      details: {
        processed: processedEmployees,
        failed: failedEmployees
      }
    };

    if (failedEmployees.length > 0) {
      result.partialSuccess = true;
      result.message = `Granted ${grantedCount} balances to ${processedEmployees.length} employee(s), failed ${failedEmployees.length}`;
    }

    console.log(`\n🎉 ========== GRANT COMPLETED ==========`);
    console.log(`🎉 Granted: ${grantedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`✅ Processed: ${processedEmployees.length}`);
    console.log(`❌ Failed: ${failedEmployees.length}`);
    if (failedEmployees.length > 0) {
      console.log(`❌ Failed employees:`, failedEmployees);
    }
    console.log(`🎯 ======================================\n`);

    return res.json(result);
  } catch (error) {
    console.error('❌ Grant yearly leaves error:', error);
    return res.status(500).json({ success: false, message: 'Error granting leaves' });
  }
};

const getEmployeeBalances = async (req, res) => {
  try {
    const { userId, year } = req.query;
    const targetUserId = userId || req.user._id;
    
    if (!year) {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const financialYearStart = currentMonth < 3 ? currentYear - 1 : currentYear;
      var targetYear = `${financialYearStart}-${financialYearStart + 1}`;
    } else {
      var targetYear = year;
    }
    
    const queryCompanyId = req.user.companyId;
    
    console.log(`\n📊 ========== GET BALANCES ==========`);
    console.log(`📊 Target User ID: ${targetUserId}`);
    console.log(`📊 Year: ${targetYear}`);
    console.log(`📊 Company ID: ${queryCompanyId}`);
    console.log(`📊 Requested by: ${req.user.email}`);

    const yearlyQuery = {
      userId: targetUserId,
      companyId: queryCompanyId,
      year: targetYear,
    };

    console.log(`📊 Yearly balance query:`, yearlyQuery);

    const yearlyBalances = await EmployeeLeaveBalance.find(yearlyQuery)
      .populate('leaveTypeId', 'name')
      .lean();

    console.log(`📊 Yearly balances found:`, yearlyBalances.length);
    if (yearlyBalances.length > 0) {
      console.log(`📊 Sample balance:`, {
        leaveType: yearlyBalances[0].leaveTypeId?.name,
        allocatedDays: yearlyBalances[0].allocatedDays,
        remainingDays: yearlyBalances[0].remainingDays,
        year: yearlyBalances[0].year,
        status: yearlyBalances[0].status,
      });
    }

    const now = new Date();
    const allocationGroups = await LeaveAllocation.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(targetUserId),
          companyId: queryCompanyId,
          status: 'active',
          expiresAt: { $gt: now },
        },
      },
      {
        $group: {
          _id: '$leaveTypeId',
          totalAllocated: { $sum: '$daysAllocated' },
          totalUsed: { $sum: '$daysUsed' },
          earliestExpiry: { $min: '$expiresAt' },
        },
      },
      {
        $lookup: {
          from: 'leavetypes',
          localField: '_id',
          foreignField: '_id',
          as: 'leaveType',
        },
      },
      { $unwind: '$leaveType' },
    ]);

    console.log(`📊 Allocation groups found:`, allocationGroups.length);

    const allocationBalances = allocationGroups.map((g) => ({
      _id: `alloc_${g._id}`,
      leaveTypeId: { _id: g._id, name: g.leaveType.name },
      allocatedDays: g.totalAllocated,
      usedDays: g.totalUsed,
      remainingDays: g.totalAllocated - g.totalUsed,
      expiresAt: g.earliestExpiryDate,
      year: 'Allocation-based',
      isAllocationBased: true,
    }));

    const balances = [...yearlyBalances, ...allocationBalances];

    console.log(`📊 Total balances to return:`, balances.length);
    console.log(`📊 ====================================\n`);

    return res.json({ success: true, balances });
  } catch (error) {
    console.error('Get employee balances error:', error);
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
      // 1. Try to consume from LeaveAllocation (FIFO)
      const allocations = await LeaveAllocation.find({
        userId: leaveRequest.userId,
        leaveTypeId: leaveRequest.leaveTypeId,
        status: 'active',
        expiresAt: { $gt: new Date() },
      }).sort({ expiresAt: 1 });

      let remainingToDeduct = leaveRequest.totalDays;

      if (allocations.length > 0) {
        for (const allocation of allocations) {
          if (remainingToDeduct <= 0) break;

          const availableInAllocation = allocation.daysAllocated - allocation.daysUsed;
          const toDeduct = Math.min(availableInAllocation, remainingToDeduct);

          allocation.daysUsed += toDeduct;
          remainingToDeduct -= toDeduct;

          if (allocation.daysUsed >= allocation.daysAllocated) {
            allocation.status = 'consumed';
          }
          await allocation.save();
        }
      }

      // 2. If still remaining, try to consume from yearly balance (legacy/yearly)
      if (remainingToDeduct > 0) {
        const year = new Date(leaveRequest.startDate).getFullYear().toString();
        const balance = await EmployeeLeaveBalance.findOne({
          userId: leaveRequest.userId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: year,
        });

        if (balance && balance.remainingDays >= remainingToDeduct) {
          balance.remainingDays -= remainingToDeduct;
          await balance.save();
          remainingToDeduct = 0;
        }
      }

      if (remainingToDeduct > 0) {
        return res.status(400).json({ success: false, message: 'Insufficient leave balance to approve' });
      }
    }

    await leaveRequest.save();

    // ── Log Activity (Only if approved) ──────────────────────────
    if (status === 'approved') {
      await logActivity(
        leaveRequest.userId,
        'leave-approved',
        `Leave Approved – ${leaveRequest.leaveType}`,
        leaveRequest.companyId
      );
    }

    return res.json({ success: true, message: `Leave ${status}` });
  } catch (error) {
    console.error('Update leave status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getGrantStatus = async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) {
      return res.status(400).json({ success: false, message: 'Year is required' });
    }

    const balances = await EmployeeLeaveBalance.find({
      year,
      companyId: req.user.companyId,
      status: 'active'
    }).lean();

    const grantMap = {};
    const employeeLeaveCounts = {};

    balances.forEach(balance => {
      const userId = balance.userId.toString();
      if (!employeeLeaveCounts[userId]) {
        employeeLeaveCounts[userId] = 0;
      }
      employeeLeaveCounts[userId]++;
      
      if (!grantMap[userId]) {
        grantMap[userId] = true;
      }
    });

    return res.json({ 
      success: true, 
      grantMap,
      employeeLeaveCounts
    });
  } catch (error) {
    console.error('Get grant status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const allocateIndividualLeave = async (req, res) => {
  try {
    const { userId, leaveTypeId, allocatedDays, validityDays } = req.body;

    if (!userId || !leaveTypeId || allocatedDays === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields (userId, leaveTypeId, allocatedDays)' });
    }

    const days = Number(allocatedDays);
    if (isNaN(days) || days <= 0) {
      return res.status(400).json({ success: false, message: 'allocatedDays must be a positive number' });
    }

    const ALLOWED_VALIDITY = [7, 15, 30, 45];
    const rawValidity = validityDays !== undefined ? Number(validityDays) : days;
    const validity = ALLOWED_VALIDITY.includes(rawValidity) ? rawValidity : rawValidity > 0 ? rawValidity : days;

    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validity);

    // Check if there's an existing active allocation for this user and leave type
    const now = new Date();
    const existingAllocation = await LeaveAllocation.findOne({
      userId,
      leaveTypeId,
      status: 'active',
      expiresAt: { $gt: now },
    });

    let allocation;
    
    if (existingAllocation) {
      // Add days to existing allocation and update expiry
      existingAllocation.daysAllocated += days;
      existingAllocation.expiresAt = expiresAt;
      await existingAllocation.save();
      allocation = existingAllocation;
    } else {
      // Create new allocation if none exists
      allocation = await LeaveAllocation.create({
        userId,
        leaveTypeId,
        companyId: req.user.companyId,
        daysAllocated: days,
        expiresAt,
        createdBy: req.user._id,
        status: 'active',
      });
    }

    await logActivity(
      userId,
      'leave-allocated',
      `Allocated ${days} days of ${leaveType.name} (expires on ${expiresAt.toDateString()})`,
      req.user.companyId
    );

    return res.json({
      success: true,
      message: `Successfully allocated ${days} days of ${leaveType.name}. Expires on ${expiresAt.toDateString()}.`,
      allocation,
      expiryDate: expiresAt,
    });
  } catch (error) {
    console.error('Allocate individual leave error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const allocateLeave = async (req, res) => {
  try {
    const { userId, leaveTypeId, days } = req.body;

    if (!userId || !leaveTypeId || !days) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 40); // 40 days validity

    const allocation = await LeaveAllocation.create({
      userId,
      leaveTypeId,
      companyId: req.user.companyId,
      daysAllocated: Number(days),
      expiresAt,
      createdBy: req.user._id,
    });

    await logActivity(
      userId,
      'leave-allocated',
      `Allocated ${days} days of ${leaveType.name} (standalone)`,
      req.user.companyId
    );

    return res.status(201).json({
      success: true,
      message: `Allocated ${days} days of ${leaveType.name}.`,
      allocation,
      expiryDate: expiresAt,
    });
  } catch (error) {
    console.error('Allocate leave error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getEmployeeLeaveCards = async (req, res) => {
  try {
    let userId = req.params.id;
    if (!userId || userId === 'me') {
      userId = req.user._id;
    }
    const now = new Date();

    // Group by leave type
    const leaveGroups = await LeaveAllocation.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: 'active',
          expiresAt: { $gt: now },
        },
      },
      {
        $group: {
          _id: '$leaveTypeId',
          totalAllocated: { $sum: '$daysAllocated' },
          totalUsed: { $sum: '$daysUsed' },
          earliestExpiry: { $min: '$expiresAt' },
        },
      },
      {
        $lookup: {
          from: 'leavetypes',
          localField: '_id',
          foreignField: '_id',
          as: 'leaveType',
        },
      },
      { $unwind: '$leaveType' },
      { $sort: { earliestExpiry: 1 } },
    ]);

    const cards = leaveGroups.map((lt) => {
      const availableDays = lt.totalAllocated - lt.totalUsed;
      const expires_in_days = Math.max(0, Math.ceil((lt.earliestExpiry - now) / (1000 * 60 * 60 * 24)));
      return {
        leave_type_id: lt._id,
        leave_type_name: lt.leaveType.name,
        available_days: availableDays,
        total_days: lt.totalAllocated,
        used_days: lt.totalUsed,
        expires_in_days,
        expiry_date: lt.earliestExpiry,
      };
    }).filter(card => card.available_days > 0);

    return res.json({ success: true, leaveCards: cards });
  } catch (error) {
    console.error('Get leave cards error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const expireLeavesJob = async () => {
  try {
    const now = new Date();
    const result = await LeaveAllocation.updateMany(
      {
        status: 'active',
        expiresAt: { $lte: now },
      },
      {
        $set: { status: 'expired' },
      }
    );
    console.log(`[Expiry Job] Expired ${result.modifiedCount} allocations at ${now.toISOString()}`);
  } catch (error) {
    console.error('[Expiry Job] Error:', error);
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Configure carry-forward settings for a leave type
// @route   PUT /api/leave/admin/carry-forward-config/:leaveTypeId
// @access  Private (Admin)
// Body:    { carryForwardEnabled, maxCarryForwardDays }
// ═════════════════════════════════════════════════════════════════
const configureCarryForward = async (req, res) => {
  try {
    const { leaveTypeId } = req.params;
    const { carryForwardEnabled, maxCarryForwardDays } = req.body;

    if (carryForwardEnabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'carryForwardEnabled is required',
      });
    }

    if (carryForwardEnabled && (maxCarryForwardDays === undefined || maxCarryForwardDays < 0)) {
      return res.status(400).json({
        success: false,
        message: 'maxCarryForwardDays is required when carryForwardEnabled is true',
      });
    }

    const leaveType = await LeaveType.findOne({
      _id: leaveTypeId,
      companyId: req.user.companyId,
    });

    if (!leaveType) {
      return res.status(404).json({
        success: false,
        message: 'Leave type not found',
      });
    }

    leaveType.carryForwardEnabled = carryForwardEnabled;
    leaveType.maxCarryForwardDays = carryForwardEnabled ? maxCarryForwardDays : 0;
    await leaveType.save();

    return res.json({
      success: true,
      message: 'Carry-forward configuration updated successfully',
      leaveType,
    });
  } catch (error) {
    console.error('Configure carry-forward error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error configuring carry-forward settings',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Preview leave reset impact
// @route   POST /api/leave/admin/preview-reset
// @access  Private (Admin)
// Body:    { resetDate }
// ═════════════════════════════════════════════════════════════════
const previewLeaveReset = async (req, res) => {
  try {
    const { resetDate } = req.body;

    if (!resetDate) {
      return res.status(400).json({
        success: false,
        message: 'resetDate is required',
      });
    }

    const activeLeaveTypes = await LeaveType.find({
      companyId: req.user.companyId,
      isActive: true,
    });

    const employees = await User.find({
      companyId: req.user.companyId,
      position: { $ne: 'intern' },
    }).lean();

    const preview = {
      resetDate,
      totalEmployeesAffected: employees.length,
      leaveTypes: [],
      summary: {
        totalLeavesWillCarryForward: 0,
        totalLeavesWillExpire: 0,
      },
    };

    for (const leaveType of activeLeaveTypes) {
      const balances = await EmployeeLeaveBalance.find({
        companyId: req.user.companyId,
        leaveTypeId: leaveType._id,
        status: 'active',
      }).lean();

      let totalCarryForward = 0;
      let totalExpire = 0;

      balances.forEach((balance) => {
        const remaining = balance.remainingDays;
        if (leaveType.carryForwardEnabled) {
          const canCarry = Math.min(remaining, leaveType.maxCarryForwardDays);
          totalCarryForward += canCarry;
          totalExpire += remaining - canCarry;
        } else {
          totalExpire += remaining;
        }
      });

      preview.leaveTypes.push({
        leaveTypeId: leaveType._id,
        leaveTypeName: leaveType.name,
        carryForwardEnabled: leaveType.carryForwardEnabled,
        maxCarryForwardDays: leaveType.maxCarryForwardDays,
        employeesWithBalance: balances.length,
        totalRemainingDays: balances.reduce((sum, b) => sum + b.remainingDays, 0),
        willCarryForward: totalCarryForward,
        willExpire: totalExpire,
      });

      preview.summary.totalLeavesWillCarryForward += totalCarryForward;
      preview.summary.totalLeavesWillExpire += totalExpire;
    }

    return res.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('Preview leave reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating preview',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Execute bulk leave reset with carry-forward
// @route   POST /api/leave/admin/execute-reset
// @access  Private (Admin)
// Body:    { resetDate, year }
// ═════════════════════════════════════════════════════════════════
const executeLeaveReset = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resetDate, year } = req.body;

    if (!resetDate || !year) {
      return res.status(400).json({
        success: false,
        message: 'resetDate and year are required',
      });
    }

    console.log(`\n🔄 ========== LEAVE RESET STARTED ==========`);
    console.log(`🔄 Reset Date: ${resetDate}`);
    console.log(`🔄 New Year: ${year}`);
    console.log(`🔄 Company: ${req.user.companyId}`);

    const activeLeaveTypes = await LeaveType.find({
      companyId: req.user.companyId,
      isActive: true,
    }).session(session);

    const employees = await User.find({
      companyId: req.user.companyId,
      position: { $ne: 'intern' },
    }).session(session);

    const resetLog = {
      resetDate: new Date(resetDate),
      processedBy: req.user._id,
      companyId: req.user.companyId,
      totalEmployeesAffected: employees.length,
      carryForwardPolicy: activeLeaveTypes.map((lt) => ({
        leaveTypeId: lt._id,
        leaveTypeName: lt.name,
        carryForwardEnabled: lt.carryForwardEnabled,
        maxCarryForwardDays: lt.maxCarryForwardDays,
      })),
      details: [],
      summary: {
        totalLeavesCarriedForward: 0,
        totalLeavesExpired: 0,
        employeesSuccessfullyProcessed: 0,
        employeesFailed: 0,
      },
    };

    let totalCarriedForward = 0;
    let totalExpired = 0;

    for (const employee of employees) {
      try {
        const employeeDetail = {
          employeeId: employee._id,
          employeeName: employee.name,
          leaveTypeBreakdown: [],
          status: 'success',
        };

        for (const leaveType of activeLeaveTypes) {
          const balance = await EmployeeLeaveBalance.findOne({
            userId: employee._id,
            leaveTypeId: leaveType._id,
            status: 'active',
          }).session(session);

          if (!balance || balance.remainingDays === 0) {
            continue;
          }

          const previousBalance = balance.remainingDays;
          const usedDays = balance.allocatedDays - balance.remainingDays;
          let carriedForward = 0;
          let expired = 0;

          if (leaveType.carryForwardEnabled && previousBalance > 0) {
            carriedForward = Math.min(previousBalance, leaveType.maxCarryForwardDays);
            expired = previousBalance - carriedForward;

            const expiryDate = new Date(year);
            const [month, day] = leaveType.fixedExpiryDate.split('-');
            expiryDate.setMonth(parseInt(month) - 1);
            expiryDate.setDate(parseInt(day));

            await EmployeeLeaveBalance.updateOne(
              { _id: balance._id },
              {
                $set: {
                  remainingDays: carriedForward,
                  isCarriedForward: true,
                  carriedForwardFrom: balance.year,
                  expiryDate: expiryDate,
                },
              }
            ).session(session);
          } else {
            expired = previousBalance;
            await EmployeeLeaveBalance.updateOne(
              { _id: balance._id },
              { $set: { status: 'expired', remainingDays: 0 } }
            ).session(session);
          }

          employeeDetail.leaveTypeBreakdown.push({
            leaveTypeId: leaveType._id,
            leaveTypeName: leaveType.name,
            previousBalance,
            usedDays,
            carriedForward,
            expired,
            newBalance: carriedForward,
          });

          totalCarriedForward += carriedForward;
          totalExpired += expired;
        }

        resetLog.details.push(employeeDetail);
        resetLog.summary.employeesSuccessfullyProcessed++;
      } catch (empError) {
        console.error(`❌ Error processing employee ${employee.name}:`, empError);
        resetLog.details.push({
          employeeId: employee._id,
          employeeName: employee.name,
          status: 'failed',
          error: empError.message,
        });
        resetLog.summary.employeesFailed++;
      }
    }

    resetLog.summary.totalLeavesCarriedForward = totalCarriedForward;
    resetLog.summary.totalLeavesExpired = totalExpired;
    resetLog.status = resetLog.summary.employeesFailed > 0 ? 'partial' : 'completed';

    await LeaveResetLog.create([resetLog], { session });

    await session.commitTransaction();
    session.endSession();

    console.log(`\n✅ ========== LEAVE RESET COMPLETED ==========`);
    console.log(`✅ Employees Processed: ${resetLog.summary.employeesSuccessfullyProcessed}`);
    console.log(`✅ Employees Failed: ${resetLog.summary.employeesFailed}`);
    console.log(`✅ Leaves Carried Forward: ${totalCarriedForward}`);
    console.log(`✅ Leaves Expired: ${totalExpired}`);

    return res.json({
      success: true,
      message: `Leave reset completed successfully. ${totalCarriedForward} days carried forward, ${totalExpired} days expired.`,
      summary: resetLog.summary,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error('❌ Execute leave reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error executing leave reset',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Get leave reset history
// @route   GET /api/leave/admin/reset-history
// @access  Private (Admin)
// ═════════════════════════════════════════════════════════════════
const getResetHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const resets = await LeaveResetLog.find({
      companyId: req.user.companyId,
    })
      .populate('processedBy', 'name email')
      .sort({ resetDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await LeaveResetLog.countDocuments({
      companyId: req.user.companyId,
    });

    return res.json({
      success: true,
      resets,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Get reset history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching reset history',
    });
  }
};

module.exports = {
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
  getLeaveTypes,
  addLeaveType,
  updateLeaveType,
  deleteLeaveType,
  grantYearlyLeaves,
  getEmployeeBalances,
  getAllLeaveRequests,
  updateLeaveStatus,
  getGrantStatus,
  allocateIndividualLeave,
  allocateLeave,
  getEmployeeLeaveCards,
  expireLeavesJob,
  configureCarryForward,
  previewLeaveReset,
  executeLeaveReset,
  getResetHistory,
};
