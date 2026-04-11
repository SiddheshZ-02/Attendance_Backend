const mongoose = require('mongoose');

const leaveResetLogSchema = new mongoose.Schema(
  {
    resetDate: {
      type: Date,
      required: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    totalEmployeesAffected: {
      type: Number,
      required: true,
    },
    carryForwardPolicy: {
      type: Object,
      required: true,
    },
    status: {
      type: String,
      enum: ['completed', 'partial', 'failed'],
      default: 'completed',
    },
    details: [
      {
        employeeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        employeeName: String,
        leaveTypeBreakdown: [
          {
            leaveTypeId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'LeaveType',
            },
            leaveTypeName: String,
            previousBalance: Number,
            usedDays: Number,
            carriedForward: Number,
            expired: Number,
            newBalance: Number,
          },
        ],
        status: {
          type: String,
          enum: ['success', 'failed'],
          default: 'success',
        },
        error: String,
      },
    ],
    summary: {
      totalLeavesCarriedForward: Number,
      totalLeavesExpired: Number,
      employeesSuccessfullyProcessed: Number,
      employeesFailed: Number,
    },
  },
  {
    timestamps: true,
  }
);

leaveResetLogSchema.index({ companyId: 1, resetDate: -1 });
leaveResetLogSchema.index({ processedBy: 1 });

module.exports = mongoose.model('LeaveResetLog', leaveResetLogSchema);
