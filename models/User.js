const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    match: [/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes']
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['employee', 'admin', 'manager'],
    default: 'employee'
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true
  },
  department: {
    type: String,
    default: '',
    maxlength: 100
  },
  phoneNumber: {
    type: String,
    default: '',
    match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0
  },
  lockUntil: {
    type: Number
  },
  lastLoginAt: {
    type: Date
  },
  passwordChangedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      if (typeof next === 'function') {
        return next(error);
      } else {
        throw error;
      }
    }
  }
  
  if (typeof next === 'function') {
    next();
  }
});

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Method to match password
userSchema.methods.matchPassword = async function(enteredPassword) {
  // Check if account is locked
  if (this.isLocked) {
    throw new Error('Account is temporarily locked due to multiple failed login attempts');
  }
  
  const isMatch = await bcrypt.compare(enteredPassword, this.password);
  
  if (isMatch) {
    // Reset login attempts on successful login
    this.loginAttempts = 0;
    this.lockUntil = undefined;
    this.lastLoginAt = new Date();
    // Use updateOne to avoid triggering middleware
    await this.constructor.updateOne({ _id: this._id }, {
      $set: {
        loginAttempts: 0,
        lockUntil: undefined,
        lastLoginAt: new Date()
      }
    });
  } else {
    // Increment login attempts on failed login
    this.loginAttempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (this.loginAttempts >= 5) {
      this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
    }
    
    // Use updateOne to avoid triggering middleware
    const updateData = {
      $inc: { loginAttempts: 1 },
      $set: { lockUntil: this.lockUntil }
    };
    await this.constructor.updateOne({ _id: this._id }, updateData);
  }
  
  return isMatch;
};

// Method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  
  return false;
};

module.exports = mongoose.model('User', userSchema);