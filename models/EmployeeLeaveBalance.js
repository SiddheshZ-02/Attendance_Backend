const mongoose = require('mongoose');

const employeeLeaveBalanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    year: {
      type: String,
      required: true,
    },
    allocatedDays: {
      type: Number,
      required: true,
      min: 0,
    },
    usedDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingDays: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'expired'],
      default: 'active',
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    expiryDate: {
      type: Date,
    },
    isCarriedForward: {
      type: Boolean,
      default: false,
    },
    carriedForwardFrom: {
      type: String,
    },
    originalGranted: {
      type: Number,
    },
    manuallyAdjusted: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

employeeLeaveBalanceSchema.index({ userId: 1, leaveTypeId: 1, year: 1, companyId: 1 }, { unique: true });
employeeLeaveBalanceSchema.index({ companyId: 1, userId: 1 });

module.exports = mongoose.model('EmployeeLeaveBalance', employeeLeaveBalanceSchema);
