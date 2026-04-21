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

// Format date to YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Calculate working hours
const calculateWorkingHours = (checkInTime, checkOutTime) => {
  const diff = new Date(checkOutTime) - new Date(checkInTime);
  const hours = diff / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
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