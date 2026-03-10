const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 150,
    },
    domain: {
      type: String,
      trim: true,
      default: '',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    plan: {
      type: String,
      default: 'free',
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

companySchema.index({ ownerId: 1, name: 1 });

module.exports = mongoose.model('Company', companySchema);

