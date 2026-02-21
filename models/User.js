const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ─── Device Sub-Schema ─────────────────────────────────────────────────────────
// Each user can register up to MAX_DEVICES devices.
// deviceId = the fingerprint sent by the app (from deviceInfo.deviceId)
const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
    },
    deviceName: {
      type: String,
      default: 'Unknown Device',
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'unknown'],
      default: 'unknown',
    },
    brand: {
      type: String,
      default: '',
    },
    model: {
      type: String,
      default: '',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // no separate _id for sub-documents
);

// ─── User Schema ───────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    // ── Basic Info ─────────────────────────────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      match: [
        /^[a-zA-Z\s\-']+$/,
        'Name can only contain letters, spaces, hyphens, and apostrophes',
      ],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // ── Role & Employment ──────────────────────────────────────────
    role: {
      type: String,
      enum: ['employee', 'admin', 'manager'],
      default: 'employee',
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true, // allows multiple null values
      trim: true,
    },
    department: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },
    phoneNumber: {
      type: String,
      default: '',
      trim: true,
    },

    // ── Account Status ─────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Login Security ─────────────────────────────────────────────
    // loginAttempts & lockUntil handle brute-force protection
    loginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Number, // Unix timestamp (ms) — when the lock expires
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },

    // ── Device Management ──────────────────────────────────────────
    // Max 3 registered devices per user (MAX_DEVICES_REACHED error)
    devices: {
      type: [deviceSchema],
      default: [],
    },

    // ── Password Reset ─────────────────────────────────────────────
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_DEVICES = 3;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ─── Virtual: isLocked ─────────────────────────────────────────────────────────
// Returns true if the account is currently locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-Save: Hash Password ───────────────────────────────────────────────────
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();

//   try {
//     const salt = await bcrypt.genSalt(10);
//     this.password = await bcrypt.hash(this.password, salt);
//     // Record time of password change (used by JWT validation)
//     this.passwordChangedAt = new Date();
//     next();
//   } catch (error) {
//     next(error);
//   }
// });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  // Record time of password change (used by JWT validation)
  this.passwordChangedAt = new Date();
});



// ─── Method: matchPassword ─────────────────────────────────────────────────────
// Returns true/false — does NOT throw on lock (caller must check isLocked first)
userSchema.methods.matchPassword = async function (enteredPassword) {
  const isMatch = await bcrypt.compare(enteredPassword, this.password);

  if (isMatch) {
    // ── Success: reset lockout state ──────────────────────────────
    await this.constructor.updateOne(
      { _id: this._id },
      {
        $set: {
          loginAttempts: 0,
          lockUntil: null,
          lastLoginAt: new Date(),
        },
      }
    );
  } else {
    // ── Failure: increment attempts, lock if threshold reached ────
    const newAttempts = (this.loginAttempts || 0) + 1;
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

    await this.constructor.updateOne(
      { _id: this._id },
      {
        $set: {
          loginAttempts: newAttempts,
          lockUntil: shouldLock ? Date.now() + LOCK_DURATION_MS : null,
        },
      }
    );
  }

  return isMatch;
};

// ─── Method: changedPasswordAfter ─────────────────────────────────────────────
// Returns true if password was changed AFTER the JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// ─── Method: createPasswordResetToken ─────────────────────────────────────────
// Generates a reset token, stores hashed version in DB, returns raw token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Store hashed version in DB (never store raw token)
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token expires in 15 minutes
  this.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken; // return raw — sent to user via email
};

// ─── Method: registerDevice ───────────────────────────────────────────────────
// Registers a new device or updates lastUsedAt if already registered.
// Returns: { isNew: bool, limitReached: bool }
userSchema.methods.registerDevice = async function (deviceInfo) {
  if (!deviceInfo || !deviceInfo.deviceId) {
    return { isNew: false, limitReached: false };
  }

  const existingIndex = this.devices.findIndex(
    (d) => d.deviceId === deviceInfo.deviceId
  );

  if (existingIndex !== -1) {
    // Device already registered — just update lastUsedAt
    await this.constructor.updateOne(
      { _id: this._id, 'devices.deviceId': deviceInfo.deviceId },
      { $set: { 'devices.$.lastUsedAt': new Date() } }
    );
    return { isNew: false, limitReached: false };
  }

  // New device — check limit
  if (this.devices.length >= MAX_DEVICES) {
    return { isNew: true, limitReached: true };
  }

  // Register new device
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $push: {
        devices: {
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName || 'Unknown Device',
          platform: deviceInfo.platform || 'unknown',
          brand: deviceInfo.brand || '',
          model: deviceInfo.model || '',
          addedAt: new Date(),
          lastUsedAt: new Date(),
        },
      },
    }
  );

  return { isNew: true, limitReached: false };
};

userSchema.index({ role: 1, isActive: 1 }); 

module.exports = mongoose.model('User', userSchema);