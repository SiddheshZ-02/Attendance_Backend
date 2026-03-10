const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    manager: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);

