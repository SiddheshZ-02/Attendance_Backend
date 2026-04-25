const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { REFRESH_TOKEN_SECRET } = require('../config/authSecrets');
const { generateToken, logActivity } = require('../utils/helpers');
const { securityLogger } = require('../utils/logger');

const CROSS_PLATFORM_SESSION_MESSAGE =
  'Session ended. Your account was used on another platform';

const getSessionPlatform = (req) => {
  const requested = String(req.body?.platform || '').trim().toLowerCase();
  if (requested === 'app' || requested === 'web') {
    return requested;
  }
  const ua = String(req.get('User-Agent') || '').toLowerCase();
  if (
    ua.includes('okhttp') ||
    ua.includes('reactnative') ||
    ua.includes('react-native') ||
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ios')
  ) {
    return 'app';
  }
  return 'web';
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — strip sensitive fields and return a clean user object
// ─────────────────────────────────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  companyId: user.companyId,
  employeeId: user.employeeId,
  department: user.department,
  phone: user.phone,
  profilePicture: user.profilePicture,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
});


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Body:    { email, password, location }
//
// location   = { latitude, longitude, accuracy } | null
// ═════════════════════════════════════════════════════════════════════════════
const loginUser = async (req, res) => {
  try {
    const { email, password, location } = req.body;
    const platform = getSessionPlatform(req);

    // ── 1. Validate required credentials ─────────────────────────
    if (!email || !password) {
      securityLogger.validationError(req.ip, req.get('User-Agent'), req.originalUrl, req.method, [
        { field: 'email, password', message: 'Required credentials missing' },
      ]);
      return res.status(400).json({
        success: false,
        code: 'MISSING_CREDENTIALS',
        message: 'Please provide email and password.',
      });
    }

    // ── 3. Find user ──────────────────────────────────────────────
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'USER_NOT_FOUND');
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // ── 4. Check account active ───────────────────────────────────
    if (!user.isActive) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'ACCOUNT_DEACTIVATED');
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account has been deactivated. Please contact HR.',
      });
    }

    // ── 5. Verify password ────────────────────────────────────────
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'INVALID_PASSWORD');

      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // ── 6. Build warnings for frontend ────────────────────────────
    const warnings = {};

    // Simple location anomaly: if user sends location and it's
    // outside India (rough bounds) flag it as suspicious
    if (location && location.latitude && location.longitude) {
      const isOutsideIndia =
        location.latitude < 8.0 ||
        location.latitude > 37.0 ||
        location.longitude < 68.0 ||
        location.longitude > 97.5;

      if (isOutsideIndia) {
        warnings.suspiciousLocation = true;
        warnings.message =
          warnings.message ||
          'Unusual login location detected.';

        securityLogger.suspiciousActivity(req.ip, req.get('User-Agent'), 'UNUSUAL_LOGIN_LOCATION', {
          userId: user._id,
          location,
        });
      }
    }

    // ── 8. Generate tokens & respond ──────────────────────────────
    securityLogger.authSuccess(user._id, req.ip, req.get('User-Agent'));

    const sessionId = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
    const deviceId = req.body?.deviceId || null;
    
    // Generate both Access and Refresh tokens (JWT-based)
    const { accessToken, refreshToken } = generateToken(
      user._id,
      sessionId,
      user.authVersion || 0,
    );

    // Create new session object
    const newSession = {
      sessionId: sessionId,
      platform,
      deviceId: deviceId,
      deviceInfo: req.get('User-Agent') || 'Unknown Device',
      refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    // Revoke opposite-platform sessions (both-way exclusivity between web/app)
    const oppositePlatform = platform === 'app' ? 'web' : 'app';
    const hadOppositePlatformSessions = user.sessions.some(s => s.platform === oppositePlatform);
    if (hadOppositePlatformSessions) {
      user.sessions = user.sessions.filter(s => s.platform !== oppositePlatform);
      user.lastSessionInvalidationAt = new Date();
      user.lastSessionInvalidationReason = 'CROSS_PLATFORM_LOGIN';
    }

    // Add session to array and limit to 2 devices
    user.sessions.push(newSession);
    if (user.sessions.length > 2) {
      // Remove oldest session to strictly keep a maximum of 2 devices
      user.sessions.shift();
    }
    
    user.lastLoginAt = new Date();
    await user.save();

    const response = {
      success: true,
      data: {
        ...sanitizeUser(user),
        token: accessToken,
        refreshToken: refreshToken,
      },
    };

    // Only include warnings key if there are any
    if (Object.keys(warnings).length > 0) {
      response.warnings = warnings;
    }

    return res.json(response);
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'LOGIN_ERROR',
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Refresh Access Token
// @route   POST /api/auth/refresh
// @access  Public (Requires valid refresh token)
// ═════════════════════════════════════════════════════════════════════════════
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token is required.',
      });
    }

    // 1. Verify token structure/expiry
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired.',
      });
    }

    // 2. Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: 'User no longer exists.',
      });
    }

    const tokenAv = decoded.av !== undefined && decoded.av !== null ? Number(decoded.av) : 0;
    const userAv = user.authVersion || 0;
    if (!Number.isFinite(tokenAv) || tokenAv !== userAv) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_VERSION_STALE',
        message: 'Your session is no longer valid. Please log in again.',
      });
    }

    // Find specific session for this token
    const currentSession = user.sessions.find(s => s.sessionId === decoded.sid);
    
    // ── 3. Detect Token Reuse (Security Enhancement) ─────────────
    const incomingHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    if (currentSession && currentSession.refreshTokenHash !== incomingHash) {
      // REUSE DETECTED: This refresh token is valid but doesn't match the current one in DB.
      // This happens if someone steals an old refresh token.
      user.sessions = []; // Clear all sessions for security
      user.authVersion = (user.authVersion || 0) + 1; // Invalidate all access tokens
      await user.save();

      securityLogger.suspiciousActivity(req.ip, req.get('User-Agent'), 'REFRESH_TOKEN_REUSE', {
        userId: user._id,
        sessionId: decoded.sid,
      });

      return res.status(403).json({
        success: false,
        code: 'TOKEN_THEFT_DETECTED',
        message: 'Security breach detected. Please log in again.',
      });
    }

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
        return res.status(401).json({
          success: false,
          code: 'SESSION_ENDED_PLATFORM_SWITCH',
          message: CROSS_PLATFORM_SESSION_MESSAGE,
        });
      }
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'Session has been revoked or updated elsewhere.',
      });
    }

    // 4. Check if expired in DB
    if (currentSession.refreshTokenExpires && currentSession.refreshTokenExpires < new Date()) {
      return res.status(401).json({
        success: false,
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      });
    }

    // 6. Generate new tokens (Rotation)
    const { accessToken, refreshToken: newRefreshToken } = generateToken(
      user._id,
      currentSession.sessionId,
      user.authVersion || 0,
    );

    // Update refresh token in DB for this specific session (Refresh Token Rotation)
    currentSession.refreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    currentSession.refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await user.save();

    return res.json({
      success: true,
      data: {
        token: accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'REFRESH_ERROR',
      message: 'Failed to refresh token.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const logoutUser = async (req, res) => {
  try {
    req.user.sessions = req.user.sessions.filter(s => s.sessionId !== req.user.currentSessionId);
    await req.user.save();

    securityLogger.authSuccess(req.user._id, req.ip, req.get('User-Agent'));

    return res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'LOGOUT_ERROR',
      message: 'Logout failed. Please try again.',
    });
  }
};

// @desc    Sign out all devices (this device included — must log in again)
// @route   POST /api/auth/logout-all
// @access  Private
const logoutAllDevices = async (req, res) => {
  try {
    req.user.sessions = [];
    req.user.authVersion = (req.user.authVersion || 0) + 1;
    await req.user.save();

    securityLogger.authSuccess(req.user._id, req.ip, req.get('User-Agent'));

    return res.json({
      success: true,
      message: 'Signed out on all devices. Please log in again.',
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'LOGOUT_ALL_ERROR',
      message: 'Could not sign out all devices.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'PROFILE_ERROR',
      message: 'Failed to retrieve profile.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
// Body:    { name, phoneNumber, department, currentPassword, newPassword }
// ═════════════════════════════════════════════════════════════════════════════
const updateUserProfile = async (req, res) => {
  try {
    const { name, phone, phoneNumber, department, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // ── Update basic fields ───────────────────────────────────────
    if (name) user.name = name.trim();
    if (phone !== undefined && String(phone).trim() !== '') user.phone = String(phone).trim();
    else if (phoneNumber !== undefined && String(phoneNumber).trim() !== '') user.phone = String(phoneNumber).trim();
    if (department !== undefined) user.department = String(department).trim();

    // ── Password change (requires current password verification) ──
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          code: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Please provide your current password to set a new one.',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          code: 'WEAK_PASSWORD',
          message: 'New password must be at least 6 characters.',
        });
      }

      const isCurrentPasswordCorrect = await user.matchPassword(currentPassword);
      if (!isCurrentPasswordCorrect) {
        return res.status(400).json({
          success: false,
          code: 'WRONG_CURRENT_PASSWORD',
          message: 'Current password is incorrect.',
        });
      }

      user.password = newPassword; // pre-save hook will hash this
      user.sessions = [];
      user.authVersion = (user.authVersion || 0) + 1;
    }

    const updatedUser = await user.save();

    // ── Log Activity ─────────────────────────────────────────────
    await logActivity(
      user._id,
      'profile-update',
      `Profile Updated`,
      user.companyId
    );

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: sanitizeUser(updatedUser),
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'UPDATE_PROFILE_ERROR',
      message: 'Failed to update profile.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Forgot password — generate reset token
// @route   POST /api/auth/forgot-password
// @access  Public
// Body:    { email }
//
// NOTE: In production, send the token via email (nodemailer/SendGrid).
//       For now it's returned in the response so you can test with Postman.
// ═════════════════════════════════════════════════════════════════════════════
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_EMAIL',
        message: 'Please provide your email address.',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Always return 200 even if user not found — prevents email enumeration
    if (!user) {
      return res.json({
        success: true,
        message:
          'If an account with this email exists, a password reset link has been sent.',
      });
    }

    // Generate reset token and save hashed version to DB
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); // skip validation for this save

    // ── TODO: In production — send email here ─────────────────────
    // await sendResetEmail(user.email, resetToken);
    // For now, return token directly (only in development)

    const responseData = {
      success: true,
      message:
        'If an account with this email exists, a password reset link has been sent.',
    };

    if (process.env.NODE_ENV === 'development') {
      responseData.resetToken = resetToken; // only visible in dev/Postman
      responseData.expiresAt = user.passwordResetExpires;
    }

    return res.json(responseData);
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'FORGOT_PASSWORD_ERROR',
      message: 'Failed to process reset request. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
// Body:    { token, newPassword }
// ═════════════════════════════════════════════════════════════════════════════
const resetPassword = async (req, res) => {
  try {
    const token = req.body.token || req.params.token;
    const { newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Reset token and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      });
    }

    // Hash the incoming raw token to compare with stored hashed token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }, // token must not be expired
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Reset token is invalid or has expired. Please request a new one.',
      });
    }

    // Update password and clear reset fields; revoke all sessions
    user.password = newPassword; // pre-save hook hashes it
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.sessions = [];
    user.authVersion = (user.authVersion || 0) + 1;

    await user.save();

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'RESET_PASSWORD_ERROR',
      message: 'Failed to reset password. Please try again.',
    });
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// @desc    Get colleagues (for birthdays, etc)
// @route   GET /api/auth/colleagues
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const getColleagues = async (req, res) => {
  try {
    const query = {
      isActive: true,
      role: { $in: ['employee', 'manager', 'admin'] },
    };

    if (req.user.companyId) {
      query.companyId = req.user.companyId;
    }

    const colleagues = await User.find(query)
      .select('name department dateOfBirth email employeeId isActive createdAt position')
      .sort({ name: 1 })
      .lean();

    // Ensure dateOfBirth is present in the response even if null
    const employeesWithDob = colleagues.map(emp => ({
      ...emp,
      dateOfBirth: emp.dateOfBirth || null
    }));

    return res.json({
      success: true,
      employees: employeesWithDob,
    });
  } catch (error) {
    console.error('❌ Get colleagues error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch colleagues.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// @desc    Get upcoming birthdays for the organization
// @route   GET /api/auth/birthdays
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const getUpcomingBirthdays = async (req, res) => {
  try {
    const query = {
      isActive: true,
      dateOfBirth: { $ne: null },
    };

    if (req.user.companyId) {
      query.companyId = req.user.companyId;
    }

    const users = await User.find(query)
      .select('name department dateOfBirth role position companyId')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingBirthdays = users
      .map((u) => {
        const dob = new Date(u.dateOfBirth);
        const birthdayThisYear = new Date(
          today.getFullYear(),
          dob.getMonth(),
          dob.getDate()
        );

        if (birthdayThisYear < today) {
          birthdayThisYear.setFullYear(today.getFullYear() + 1);
        }

        const diffTime = birthdayThisYear.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
          ...u,
          id: u._id,
          daysUntil: diffDays,
          birthdayDate: birthdayThisYear,
        };
      })
      .filter((u) => u.daysUntil >= 0 && u.daysUntil <= 10)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return res.json({
      success: true,
      birthdays: upcomingBirthdays,
    });
  } catch (error) {
    console.error('❌ Get upcoming birthdays error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming birthdays.',
    });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// @desc    Update profile picture
// @route   PUT /api/auth/profile-picture
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'NO_FILE',
        message: 'Please upload an image file.',
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      // Delete the uploaded file if user not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Delete old profile picture if it exists
    if (user.profilePicture) {
      const oldPath = path.join(__dirname, '..', user.profilePicture);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.error('Failed to delete old profile picture:', err);
        }
      }
    }

    // Update user with new relative path
    const relativePath = `uploads/profiles/${req.file.filename}`;
    user.profilePicture = relativePath;
    await user.save();

    return res.json({
      success: true,
      message: 'Profile picture updated successfully.',
      data: {
        profilePicture: relativePath,
      },
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    return res.status(500).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: 'Failed to upload profile picture.',
    });
  }
};

module.exports = {
  loginUser,
  logoutUser,
  logoutAllDevices,
  getUserProfile,
  updateUserProfile,
  updateProfilePicture,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  getColleagues,
  getUpcomingBirthdays,
};
