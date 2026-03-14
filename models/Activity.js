const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: false,
    },
    type: {
      type: String,
      enum: ['check-in', 'check-out', 'leave-approved', 'profile-update', 'document-upload'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD for easier filtering by client date
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying of user's activities by date
activitySchema.index({ userId: 1, date: 1, timestamp: -1 });

module.exports = mongoose.model('Activity', activitySchema);
