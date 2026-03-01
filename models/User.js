const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');


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
    position: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },

    // ── Account Status ─────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },


    lastLoginAt: {
      type: Date,
      default: null,
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



userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (this.password && /^\$2[aby]\$/.test(this.password)) {
    this.passwordChangedAt = new Date();
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});



// ─── Method: matchPassword ─────────────────────────────────────────────────────
// Returns true/false for password comparison
userSchema.methods.matchPassword = async function (enteredPassword) {
  const isMatch = await bcrypt.compare(enteredPassword, this.password);
  
  if (isMatch) {
    // Update last login timestamp
    await this.constructor.updateOne(
      { _id: this._id },
      { $set: { lastLoginAt: new Date() } }
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


userSchema.index({ role: 1, isActive: 1 }); 

module.exports = mongoose.model('User', userSchema);
