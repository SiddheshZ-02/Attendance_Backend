const Activity = require('../models/Activity');
const { formatDate } = require('../utils/helpers');

// ═════════════════════════════════════════════════════════════════
// @desc    Get user's activities for today
// @route   GET /api/activity/today
// @access  Private
// Query:   ?date=YYYY-MM-DD (defaults to server today if not provided)
//          &page=1 &limit=50
// ═════════════════════════════════════════════════════════════════
const getTodayActivities = async (req, res) => {
  try {
    const { date, page = 1, limit = 50 } = req.query;
    
    // Use provided date or fallback to server's today in YYYY-MM-DD
    const targetDate = date || formatDate(new Date());

    const query = {
      userId: req.user._id,
      date: targetDate,
    };

    if (req.user.companyId) {
      query.companyId = req.user.companyId;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const totalCount = await Activity.countDocuments(query);

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      activities,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalCount / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Get activities error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// @desc    Get user's recent activities (across all dates)
// @route   GET /api/activity/recent
// @access  Private
// Query:   ?limit=10
// ═════════════════════════════════════════════════════════════════
const getRecentActivities = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const query = {
      userId: req.user._id,
    };

    if (req.user.companyId) {
      query.companyId = req.user.companyId;
    }

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error('❌ Get recent activities error:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    });
  }
};

module.exports = {
  getTodayActivities,
  getRecentActivities,
};
