const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { securityLogger } = require('../utils/logger');

// ═════════════════════════════════════════════════════════════════════════════
// protect — verifies JWT and attaches user to req.user
// ═════════════════════════════════════════════════════════════════════════════
const protect = async (req, res, next) => {
  let token;

  // ── 1. Extract token from Authorization header ────────────────
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), 'NO_TOKEN_PROVIDED');
    return res.status(401).json({
      success: false,
      code: 'NO_TOKEN',
      message: 'Not authorized. No token provided.',
    });
  }

  try {
    // ── 2. Verify token ─────────────────────────────────────────
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    // ── 3. Fetch user from DB ───────────────────────────────────
    const user = await User.findById(decoded.id).select(
      '-password -passwordResetToken -passwordResetExpires'
    );

    if (!user) {
      securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), 'TOKEN_USER_NOT_FOUND');
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Not authorized. User no longer exists.',
      });
    }

    // ── 4. Check if account is active ──────────────────────────
    if (!user.isActive) {
      securityLogger.authFailure(user.email, req.ip, req.get('User-Agent'), 'INACTIVE_ACCOUNT_ACCESS');
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account has been deactivated. Please contact HR.',
      });
    }

    // ── 5. Check if account is locked ──────────────────────────
    if (user.isLocked) {
      const remainingMs = user.lockUntil - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60000);
      securityLogger.authFailure(user.email, req.ip, req.get('User-Agent'), 'LOCKED_ACCOUNT_ACCESS');
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account temporarily locked. Try again in ${remainingMins} minute(s).`,
        retryAfterMinutes: remainingMins,
      });
    }

    // ── 6. Check if password was changed after JWT was issued ───
    if (decoded.iat && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        code: 'PASSWORD_CHANGED',
        message: 'Your password was recently changed. Please log in again.',
      });
    }

    // ── 7. Attach user and proceed ──────────────────────────────
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors with clear messages
    let code = 'INVALID_TOKEN';
    let message = 'Not authorized. Token is invalid.';

    if (error.name === 'TokenExpiredError') {
      code = 'TOKEN_EXPIRED';
      message = 'Your session has expired. Please log in again.';
    } else if (error.name === 'JsonWebTokenError') {
      code = 'INVALID_TOKEN';
      message = 'Invalid token. Please log in again.';
    }

    securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), code);

    return res.status(401).json({
      success: false,
      code,
      message,
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// admin — checks that the authenticated user has role = 'admin'
// Must be used AFTER protect middleware
// ═════════════════════════════════════════════════════════════════════════════
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  securityLogger.suspiciousActivity(
    req.ip,
    req.get('User-Agent'),
    'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
    { userId: req.user?._id, role: req.user?.role, route: req.originalUrl }
  );

  return res.status(403).json({
    success: false,
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'Access denied. Admin privileges required.',
  });
};


// ═════════════════════════════════════════════════════════════════════════════
// manager — checks that user has role = 'admin' OR 'manager'
// Must be used AFTER protect middleware
// ═════════════════════════════════════════════════════════════════════════════
const manager = (req, res, next) => {
  if (req.user && ['admin', 'manager'].includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'Access denied. Manager or Admin privileges required.',
  });
};


module.exports = { protect, admin, manager };