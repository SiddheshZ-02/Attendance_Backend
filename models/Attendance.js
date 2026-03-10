const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },

    // ─── Work Mode ────────────────────────────────────────────────
    workMode: {
      type: String,
      enum: ['Office', 'WFH'],
      required: true,
    },

    // ─── Check-In ─────────────────────────────────────────────────
    checkInTime: {
      type: Date,
      required: true,
    },

    checkInLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        // [longitude, latitude]  — GeoJSON standard
        type: [Number],
        required: true,
      },
    },

    // ─── Check-Out ────────────────────────────────────────────────
    checkOutTime: {
      type: Date,
      default: null,
    },

    checkOutLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        // [longitude, latitude]
        type: [Number],
        default: null,
      },
    },

    // ─── WFH Specific ─────────────────────────────────────────────
    // Radius (in metres) within which the user must be
    // when checking out on a WFH day.
    // Derived from checkInLocation — stored so the value
    // is immutable even if the config changes later.
    wfhCheckoutRadius: {
      type: Number,
      default: 100, // 100 m  — adjust as needed
    },

    // ─── Status & Hours ───────────────────────────────────────────
    status: {
      type: String,
      enum: ['checked-in', 'checked-out'],
      default: 'checked-in',
    },

    workingHours: {
      type: Number,
      default: 0,
    },

    // ─── Date (YYYY-MM-DD) ────────────────────────────────────────
    // Stored as a plain string so date-range queries are simple
    // and timezone issues are avoided.
    date: {
      type: String,
      required: true,
    },

    // ─── Optional Notes ───────────────────────────────────────────
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

attendanceSchema.index({ checkInLocation: '2dsphere' });

attendanceSchema.index({ userId: 1, date: 1 });
attendanceSchema.index({ date: 1, workMode: 1 });
attendanceSchema.index({ companyId: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
