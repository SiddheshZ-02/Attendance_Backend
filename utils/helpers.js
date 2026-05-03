const { format, toDate } = require('date-fns');
const { formatInTimeZone } = require('date-fns-tz');

// Default timezone for the application
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return distance; // in meters
};

const { JWT_SECRET, REFRESH_TOKEN_SECRET } = require('../config/authSecrets');

// Generate JWT tokens (Access and Refresh). `av` = user.authVersion for global invalidation.
const generateToken = (id, sessionId, authVersion = 0) => {
  const jwt = require('jsonwebtoken');
  const av = typeof authVersion === 'number' && authVersion >= 0 ? authVersion : 0;

  const accessToken = jwt.sign(
    { id, sid: sessionId, av },
    JWT_SECRET,
    { expiresIn: '1h' },
  );

  const refreshToken = jwt.sign(
    { id, sid: sessionId, av },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '30d' },
  );

  return { accessToken, refreshToken };
};

/**
 * Formats a date to YYYY-MM-DD in a specific timezone
 * @param {Date|string|number} date 
 * @param {string} tz Timezone (e.g., 'Asia/Kolkata')
 * @returns {string} Formatted date string
 */
const formatDate = (date, tz = DEFAULT_TIMEZONE) => {
  const d = new Date(date);
  return formatInTimeZone(d, tz, 'yyyy-MM-dd');
};

/**
 * Calculates working hours between two dates
 * @param {Date|string} checkInTime 
 * @param {Date|string} checkOutTime 
 * @returns {number} Hours as a decimal (e.g., 8.5)
 */
const calculateWorkingHours = (checkInTime, checkOutTime) => {
  const start = new Date(checkInTime);
  const end = new Date(checkOutTime);
  const diff = end.getTime() - start.getTime();
  const hours = diff / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
};

/**
 * Gets the current time in a specific timezone
 * @param {string} tz 
 * @returns {Date}
 */
const getCurrentTimeInTZ = (tz = DEFAULT_TIMEZONE) => {
  return toDate(new Date(), { timeZone: tz });
};

// Log activity to the database
const logActivity = async (userId, type, description, companyId = null, metadata = {}, customDate = null) => {
  try {
    const Activity = require('../models/Activity');
    const now = new Date();
    const date = customDate || formatDate(now);
    
    await Activity.create({
      userId,
      companyId,
      type,
      description,
      timestamp: now,
      date,
      metadata,
    });
  } catch (error) {
    console.error('❌ Log activity error:', error);
  }
};

module.exports = {
  calculateDistance,
  generateToken,
  formatDate,
  calculateWorkingHours,
  logActivity,
};