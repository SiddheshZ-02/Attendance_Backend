const User = require('../models/User');
const { generateToken } = require('../utils/helpers');
const { securityLogger } = require('../utils/logger');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, department, phoneNumber } = req.body;

    // Validation
    if (!name || !email || !password) {
      securityLogger.validationError(
        req.ip,
        req.get('User-Agent'),
        req.originalUrl,
        req.method,
        [{ field: 'name, email, password', message: 'Required fields are missing' }]
      );
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields',
        code: 'MISSING_FIELDS'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      securityLogger.suspiciousActivity(
        req.ip,
        req.get('User-Agent'),
        'ATTEMPTED_DUPLICATE_REGISTRATION',
        { email }
      );
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Generate employee ID
    const employeeId = 'EMP' + Date.now();

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'employee',
      employeeId,
      department: department || '',
      phoneNumber: phoneNumber || ''
    });

    if (user) {
      securityLogger.authSuccess(user._id, req.ip, req.get('User-Agent'));
      res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
          department: user.department,
          phoneNumber: user.phoneNumber,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: 'Invalid user data',
        code: 'INVALID_USER_DATA'
      });
    }
  } catch (error) {
    securityLogger.systemError(error, req);
    res.status(500).json({ 
      success: false,
      message: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      securityLogger.validationError(
        req.ip,
        req.get('User-Agent'),
        req.originalUrl,
        req.method,
        [{ field: 'email, password', message: 'Required fields are missing' }]
      );
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Check user
    const user = await User.findOne({ email });
    if (!user) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'USER_NOT_FOUND');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'ACCOUNT_DEACTIVATED');
      return res.status(401).json({ 
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      securityLogger.authFailure(email, req.ip, req.get('User-Agent'), 'INVALID_PASSWORD');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    securityLogger.authSuccess(user._id, req.ip, req.get('User-Agent'));
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        phoneNumber: user.phoneNumber,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    securityLogger.systemError(error, req);
    res.status(500).json({ 
      success: false,
      message: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json({
        success: true,
        data: user
      });
    } else {
      res.status(404).json({ 
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
  } catch (error) {
    securityLogger.systemError(error, req);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve profile',
      code: 'PROFILE_ERROR'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
      user.department = req.body.department || user.department;
      
      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        success: true,
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          employeeId: updatedUser.employeeId,
          department: updatedUser.department,
          phoneNumber: updatedUser.phoneNumber,
          token: generateToken(updatedUser._id)
        }
      });
    } else {
      res.status(404).json({ 
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
  } catch (error) {
    securityLogger.systemError(error, req);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update profile',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile
};