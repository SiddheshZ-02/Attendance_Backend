const express = require('express');
const router = express.Router();
const { getTodayActivities } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.get('/today', protect, getTodayActivities);

module.exports = router;
