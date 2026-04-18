const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    plan: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'overdue'],
      default: 'pending',
    },
    period: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
    },
    description: {
      type: String,
    },
    items: [
      {
        description: String,
        quantity: { type: Number, default: 1 },
        unitPrice: Number,
        total: Number,
      },
    ],
  },
  { timestamps: true }
);

// Compound indexes for query optimization
invoiceSchema.index({ companyId: 1, status: 1 });
invoiceSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
