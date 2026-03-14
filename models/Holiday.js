const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    description: {
      type: String,
      trim: true,
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

// Ensure unique date per company (requirement: "no two holidays can overlap on the same date")
holidaySchema.index({ companyId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
