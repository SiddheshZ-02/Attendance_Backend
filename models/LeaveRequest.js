
const mongoose = require('mongoose');


const leaveRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'vacation', 'other'],
    default: 'casual'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvalDate: {
    type: Date,
    default: null
  },
  adminComment: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});


leaveRequestSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);