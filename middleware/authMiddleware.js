const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/authSecrets');
const { securityLogger } = require('../utils/logger');

const CROSS_PLATFORM_SESSION_MESSAGE =
  'Session ended. Your account was used on another platform';

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
    const decoded = jwt.verify(token, JWT_SECRET);

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

    const tokenAv = decoded.av !== undefined && decoded.av !== null ? Number(decoded.av) : 0;
    const userAv = user.authVersion || 0;
    if (Number.isFinite(tokenAv) && tokenAv !== userAv) {
      securityLogger.authFailure(user.email, req.ip, req.get('User-Agent'), 'TOKEN_VERSION_STALE');
      return res.status(401).json({
        success: false,
        code: 'TOKEN_VERSION_STALE',
        message: 'Your session is no longer valid. Please log in again.',
      });
    }

    const currentSession = user.sessions.find(s => s.sessionId === decoded.sid);

    if (!currentSession) {
      const tokenIssuedAtMs = decoded.iat ? Number(decoded.iat) * 1000 : null;
      const invalidatedAtMs = user.lastSessionInvalidationAt
        ? user.lastSessionInvalidationAt.getTime()
        : null;
      const isCrossPlatformInvalidation =
        user.lastSessionInvalidationReason === 'CROSS_PLATFORM_LOGIN' &&
        Number.isFinite(tokenIssuedAtMs) &&
        Number.isFinite(invalidatedAtMs) &&
        tokenIssuedAtMs <= invalidatedAtMs;
      if (isCrossPlatformInvalidation) {
        securityLogger.authFailure(user.email, req.ip, req.get('User-Agent'), 'SESSION_ENDED_PLATFORM_SWITCH');
        return res.status(401).json({
          success: false,
          code: 'SESSION_ENDED_PLATFORM_SWITCH',
          message: CROSS_PLATFORM_SESSION_MESSAGE,
        });
      }
      securityLogger.authFailure(user.email, req.ip, req.get('User-Agent'), 'SESSION_REVOKED');
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'Your session is no longer active or was logged out elsewhere. Please log in again.',
      });
    }

    // Temporarily attach currentSessionId to user to use in logout
    user.currentSessionId = currentSession.sessionId;

    if (decoded.iat && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        code: 'PASSWORD_CHANGED',
        message: 'Your password was recently changed. Please log in again.',
      });
    }

    // ── 6. Attach user and proceed ──────────────────────────────
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


const owner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    return next();
  }

  return res.status(403).json({
    success: false,
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'Access denied. Owner privileges required.',
  });
};


module.exports = { protect, admin, manager, owner };
