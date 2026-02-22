const crypto = require('crypto');
const User = require('../models/User');
const { generateToken } = require('../utils/helpers');
const { securityLogger } = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — strip sensitive fields and return a clean user object
// ─────────────────────────────────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  employeeId: user.employeeId,
  department: user.department,
  phoneNumber: user.phoneNumber,
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

    // ── 8. Generate token & respond ───────────────────────────────
    securityLogger.authSuccess(user._id, req.ip, req.get('User-Agent'));

    const token = generateToken(user._id);

    const response = {
      success: true,
      data: {
        ...sanitizeUser(user),
        token,
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
// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
// ═════════════════════════════════════════════════════════════════════════════
const logoutUser = async (req, res) => {
  try {


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
    const { name, phoneNumber, department, currentPassword, newPassword } = req.body;

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
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber.trim();
    if (department !== undefined) user.department = department.trim();

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
    }

    const updatedUser = await user.save();

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
    const { token, newPassword } = req.body;

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

    // Update password and clear reset fields
    user.password = newPassword; // pre-save hook hashes it
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

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


module.exports = {
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
};