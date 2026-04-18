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
    // Subscription details
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'premium', 'enterprise'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'suspended', 'trial'],
        default: 'trial',
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      renewalDate: {
        type: Date,
      },
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'INR',
      },
      employeeCount: {
        type: Number,
        default: 0,
      },
      maxEmployees: {
        type: Number,
        default: 25,
      },
    },
    // Company status
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
    // Additional company info
    industry: {
      type: String,
      trim: true,
    },
    registrationDate: {
      type: Date,
    },
    logo: {
      type: String,
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

companySchema.index({ ownerId: 1, name: 1 });
companySchema.index({ ownerId: 1, isDeleted: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ 'subscription.renewalDate': 1 });

module.exports = mongoose.model('Company', companySchema);

