const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

/**
 * Login: per-IP + normalized email to slow credential stuffing.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_LOGIN',
    message: 'Too many login attempts. Please try again later.',
  },
  keyGenerator: (req) => {
    const email = (req.body && typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '');
    return `${ipKeyGenerator(req)}|${email}`;
  },
});
/**
 * Refresh: per-IP only (body is opaque refresh JWT).
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_REFRESH',
    message: 'Too many refresh attempts. Please try again later.',
  },
});

module.exports = { loginLimiter, refreshLimiter };
