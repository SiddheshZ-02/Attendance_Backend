const mongoose = require('mongoose');

const weekOffConfigSchema = new mongoose.Schema(
  {
    daysOfWeek: {
      type: [Number],
      default: [0],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WeekOffConfig', weekOffConfigSchema);

