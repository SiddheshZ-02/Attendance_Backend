const mongoose = require('mongoose');

const officeLocationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    name: {
      type: String,
      required: true,
      default: 'Main Office',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    radius: {
      type: Number,
      default: 50,
      required: true,
    },
    address: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

officeLocationSchema.index({ location: '2dsphere' });
officeLocationSchema.index({ companyId: 1, isActive: 1 });

module.exports = mongoose.model('OfficeLocation', officeLocationSchema);
