const mongoose = require('mongoose');

const weekOffConfigSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    daysOfWeek: {
      type: [Number],
      default: [0],
    },
  },
  {
    timestamps: true,
  }
);

weekOffConfigSchema.index({ companyId: 1 }, { unique: true });

module.exports = mongoose.model('WeekOffConfig', weekOffConfigSchema);
