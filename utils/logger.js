const winston = require('winston');

// Create a Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'employee-attendance-api' },
  transports: [
    // File transport for error logs
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport for all logs
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Ensure log directory exists
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Security-specific logging functions
const securityLogger = {
  /**
   * Log successful authentication events
   */
  authSuccess: (userId, ip, userAgent) => {
    logger.info('Authentication Successful', {
      type: 'AUTH_SUCCESS',
      userId,
      ip,
      userAgent,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log failed authentication attempts
   */
  authFailure: (username, ip, userAgent, reason = 'INVALID_CREDENTIALS') => {
    logger.warn('Authentication Failed', {
      type: 'AUTH_FAILURE',
      username,
      ip,
      userAgent,
      reason,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log suspicious activities
   */
  suspiciousActivity: (ip, userAgent, action, details) => {
    logger.warn('Suspicious Activity Detected', {
      type: 'SUSPICIOUS_ACTIVITY',
      ip,
      userAgent,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log potential security threats
   */
  securityThreat: (threatType, ip, userAgent, details) => {
    logger.error('Security Threat Detected', {
      type: 'SECURITY_THREAT',
      threatType,
      ip,
      userAgent,
      details,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log rate limiting events
   */
  rateLimit: (ip, endpoint, windowMs) => {
    logger.warn('Rate Limit Exceeded', {
      type: 'RATE_LIMIT',
      ip,
      endpoint,
      windowMs,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log input validation errors
   */
  validationError: (ip, userAgent, url, method, errors) => {
    logger.warn('Input Validation Error', {
      type: 'VALIDATION_ERROR',
      ip,
      userAgent,
      url,
      method,
      errors,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log successful API requests
   */
  apiRequest: (ip, userAgent, url, method, statusCode, duration) => {
    logger.info('API Request', {
      type: 'API_REQUEST',
      ip,
      userAgent,
      url,
      method,
      statusCode,
      duration,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log system errors
   */
  systemError: (error, req = null) => {
    const errorLog = {
      type: 'SYSTEM_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    };

    if (req) {
      errorLog.ip = req.ip;
      errorLog.userAgent = req.get('User-Agent');
      errorLog.url = req.originalUrl;
      errorLog.method = req.method;
    }

    logger.error('System Error', errorLog);
  }
};

module.exports = { logger, securityLogger };