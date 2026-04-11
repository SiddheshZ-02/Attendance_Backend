const mongoose = require('mongoose');

const leaveAllocationSchema = new mongoose.Schema(
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
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    daysAllocated: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value'
      }
    },
    daysUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    allocatedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'consumed'],
      default: 'active',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Composite index for fast lookups and FIFO sorting
leaveAllocationSchema.index({ userId: 1, leaveTypeId: 1, expiresAt: 1 });
leaveAllocationSchema.index({ companyId: 1 });

module.exports = mongoose.model('LeaveAllocation', leaveAllocationSchema);
