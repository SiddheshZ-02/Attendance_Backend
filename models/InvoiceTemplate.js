const mongoose = require('mongoose');

const invoiceTemplateSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    logo: {
      type: String,
      default: '',
    },
    signature: {
      type: String,
      default: '',
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      zipCode: { type: String, default: '' },
    },
    phone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      default: '',
    },
    gstNumber: {
      type: String,
      default: '',
    },
    bankDetails: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      accountHolder: { type: String, default: '' },
      upiId: { type: String, default: '' },
    },
    paymentTerms: {
      type: String,
      enum: ['Net 15', 'Net 30', 'Net 60', 'Due on receipt'],
      default: 'Net 30',
    },
    taxRate: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },
    taxNumber: {
      type: String,
      default: '',
    },
    termsAndConditions: {
      type: String,
      default: 'Payment is due within the specified payment terms. Late payments may incur additional charges.',
    },
    footerNotes: {
      type: String,
      default: 'Thank you for your business!',
    },
    primaryColor: {
      type: String,
      default: '#3b82f6',
    },
    templateStyle: {
      type: String,
      enum: ['modern', 'classic', 'minimal'],
      default: 'modern',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InvoiceTemplate', invoiceTemplateSchema);
