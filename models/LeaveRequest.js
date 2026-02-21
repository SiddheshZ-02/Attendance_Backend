const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    // ─── User Reference ───────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
leaveRequestSchema.pre('save', function (next) {
  if (this.startDate && this.endDate) {
    const diffMs = new Date(this.endDate) - new Date(this.startDate);
    // +1 to include both start and end day
    this.totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }
  next();
});

// ─── Indexes ──────────────────────────────────────────────────────
leaveRequestSchema.index({ userId: 1, status: 1 });
leaveRequestSchema.index({ userId: 1, startDate: 1, endDate: 1 }); // for overlap queries
leaveRequestSchema.index({ status: 1, createdAt: -1 });            // for admin dashboard

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);