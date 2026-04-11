const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    yearlyCount: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    carryForwardEnabled: {
      type: Boolean,
      default: false,
    },
    maxCarryForwardDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiryType: {
      type: String,
      enum: ['fixed_date', 'financial_year', 'rolling'],
      default: 'financial_year',
    },
    fixedExpiryDate: {
      type: String,
      default: '03-31',
      validate: {
        validator: function(v) {
          return !v || /^\d{2}-\d{2}$/.test(v);
        },
        message: 'Expiry date must be in MM-DD format (e.g., 03-31)',
      },
    },
  },
  {
    timestamps: true,
  }
);

leaveTypeSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
