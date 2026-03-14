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
  },
  {
    timestamps: true,
  }
);

leaveTypeSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
