const mongoose = require('mongoose');

const ownerSettingsSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    platform: {
      name: {
        type: String,
        default: 'EMS Pro',
      },
      domain: {
        type: String,
      },
      supportEmail: {
        type: String,
      },
      logo: {
        type: String,
      },
    },
    notifications: {
      newCompanySignup: {
        type: Boolean,
        default: true,
      },
      paymentReceived: {
        type: Boolean,
        default: true,
      },
      planExpiryAlerts: {
        type: Boolean,
        default: true,
      },
      supportTicketOpened: {
        type: Boolean,
        default: true,
      },
      platformErrorAlerts: {
        type: Boolean,
        default: true,
      },
    },
    security: {
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      sessionTimeout: {
        type: Number,
        default: 30, // minutes
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OwnerSettings', ownerSettingsSchema);
