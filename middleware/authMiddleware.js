const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { securityLogger } = require('../utils/logger');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      req.user = await User.findById(decoded.id).select('-password');
      
      // Check if password was changed after JWT was issued
      if (req.user && decoded.iat && req.user.changedPasswordAfter(decoded.iat)) {
        return res.status(401).json({ 
          success: false,
          message: 'Token invalid, password was changed',
          code: 'PASSWORD_CHANGED'
        });
      }
      
      if (!req.user) {
        securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), 'TOKEN_USER_MISMATCH');
        return res.status(401).json({ 
          success: false,
          message: 'Not authorized, user not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Check if user is active
      if (!req.user.isActive) {
        securityLogger.authFailure(req.user.email, req.ip, req.get('User-Agent'), 'INACTIVE_ACCOUNT_ACCESS_ATTEMPT');
        return res.status(401).json({ 
          success: false,
          message: 'Account is deactivated',
          code: 'ACCOUNT_INACTIVE'
        });
      }
      
      // Check if account is locked
      if (req.user.isLocked) {
        securityLogger.authFailure(req.user.email, req.ip, req.get('User-Agent'), 'LOCKED_ACCOUNT_ACCESS_ATTEMPT');
        return res.status(401).json({ 
          success: false,
          message: 'Account is temporarily locked due to multiple failed login attempts',
          code: 'ACCOUNT_LOCKED'
        });
      }
      
      next();
    } catch (error) {
      securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), 'INVALID_TOKEN');
      return res.status(401).json({ 
        success: false,
        message: 'Not authorized, token failed',
        code: 'INVALID_TOKEN'
      });
    }
  }

  if (!token) {
    securityLogger.authFailure('unknown', req.ip, req.get('User-Agent'), 'NO_TOKEN_PROVIDED');
    return res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token',
      code: 'NO_TOKEN'
    });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    securityLogger.suspiciousActivity(
      req.ip,
      req.get('User-Agent'),
      'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
      { userId: req.user?._id, attemptedRoute: req.originalUrl }
    );
    res.status(403).json({ 
      success: false,
      message: 'Not authorized as admin',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
};

module.exports = { protect, admin };