const express = require('express');
const router = express.Router();
const { getTodayActivities, getRecentActivities } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.get('/today', protect, getTodayActivities);
router.get('/recent', protect, getRecentActivities);

module.exports = router;
