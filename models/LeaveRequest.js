const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    // ─── User Reference ───────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },

    // ─── Leave Dates ──────────────────────────────────────────────
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },

    // Auto-calculated on save: number of calendar days requested
    totalDays: {
      type: Number,
      default: 0,
    },

    // ─── Leave Details ────────────────────────────────────────────
    reason: {
      type: String,
      required: true,
      trim: true,
    },

    leaveType: {
      type: String,
      enum: ['sick', 'casual', 'vacation', 'other'],
      default: 'casual',
    },

    // ─── Status ───────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },

    // ─── Admin Fields ─────────────────────────────────────────────
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvalDate: {
      type: Date,
      default: null,
    },
    adminComment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Auto-calculate totalDays before save ─────────────────────────
// Disabled hook; totalDays is now calculated in the controller.

leaveRequestSchema.index({ userId: 1, status: 1 });
leaveRequestSchema.index({ userId: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ status: 1, createdAt: -1 });
leaveRequestSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
