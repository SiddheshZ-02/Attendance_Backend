const Holiday = require('../models/Holiday');
const { formatDate } = require('../utils/helpers');

// ═════════════════════════════════════════════════════════════════
// @desc    Get all holidays for a company
// @route   GET /api/holidays
// @access  Private
// ═════════════════════════════════════════════════════════════════
const getHolidays = async (req, res) => {
  try {
    let companyId = req.user.companyId || null;
    
    // ── DEV AUTO-FIX ──
    if (!companyId) {
      const firstCompany = await Company.findOne();
      if (firstCompany) {
        await User.findByIdAndUpdate(req.user._id, { companyId: firstCompany._id });
        companyId = firstCompany._id;
      }
    }

    const query = { companyId };
    
    const holidays = await Holiday.find(query)
      .sort({ date: 1 })
      .lean();

    return res.json({
      success: true,
      holidays,
    });
  } catch (error) {
    console.error('❌ Get holidays error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong while fetching holidays.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Create a new holiday
// @route   POST /api/holidays
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const Company = require('../models/Company');
const User = require('../models/User');

const createHoliday = async (req, res) => {
  try {
    const { name, date, description } = req.body;
    let companyId = req.user.companyId || null;

    // ── DEV AUTO-FIX: If user has no company, assign the first available one ──
    if (!companyId) {
      const firstCompany = await Company.findOne();
      if (firstCompany) {
        await User.findByIdAndUpdate(req.user._id, { companyId: firstCompany._id });
        companyId = firstCompany._id;
        console.log(`[AUTOFIX] Assigned company ${firstCompany._id} to user ${req.user._id}`);
      }
    }

    if (!name || !date) {
      console.log('[CREATE_HOLIDAY_DEBUG] Validation failed: missing name or date');
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Name and date are required.',
      });
    }

    if (!companyId) {
      console.log('[CREATE_HOLIDAY_DEBUG] Validation failed: missing companyId');
      return res.status(400).json({
        success: false,
        code: 'MISSING_COMPANY',
        message: 'Your account is not associated with any company. Please contact support.',
      });
    }

    // Validation: Check for overlapping date
    const existingHoliday = await Holiday.findOne({
      companyId,
      date,
    });

    if (existingHoliday) {
      return res.status(400).json({
        success: false,
        code: 'DUPLICATE_DATE',
        message: 'A holiday already exists on this date.',
      });
    }

    const holiday = await Holiday.create({
      companyId,
      name,
      date,
      description,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      holiday,
    });
  } catch (error) {
    console.error('❌ Create holiday error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: error.message || 'Something went wrong while creating the holiday.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Update an existing holiday
// @route   PUT /api/holidays/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const updateHoliday = async (req, res) => {
  try {
    const { name, date, description } = req.body;
    const holidayId = req.params.id;
    const companyId = req.user.companyId || null;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_COMPANY',
        message: 'Your account is not associated with any company.',
      });
    }

    let holiday = await Holiday.findOne({
      _id: holidayId,
      companyId,
    });

    if (!holiday) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Holiday not found.',
      });
    }

    // Check if new date overlaps with another holiday
    if (date && date !== holiday.date) {
      const existing = await Holiday.findOne({
        companyId,
        date,
        _id: { $ne: holidayId },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          code: 'DUPLICATE_DATE',
          message: 'Another holiday already exists on this date.',
        });
      }
    }

    holiday.name = name || holiday.name;
    holiday.date = date || holiday.date;
    holiday.description = description !== undefined ? description : holiday.description;

    await holiday.save();

    return res.json({
      success: true,
      holiday,
    });
  } catch (error) {
    console.error('❌ Update holiday error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: error.message || 'Something went wrong while updating the holiday.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Delete a holiday
// @route   DELETE /api/holidays/:id
// @access  Private/Admin
// ═════════════════════════════════════════════════════════════════
const deleteHoliday = async (req, res) => {
  try {
    const holidayId = req.params.id;
    const companyId = req.user.companyId || null;

    const result = await Holiday.deleteOne({
      _id: holidayId,
      companyId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Holiday not found or unauthorized.',
      });
    }

    return res.json({
      success: true,
      message: 'Holiday deleted successfully.',
    });
  } catch (error) {
    console.error('❌ Delete holiday error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong while deleting the holiday.',
    });
  }
};

module.exports = {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
};
