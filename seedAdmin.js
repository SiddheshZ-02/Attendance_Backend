const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User'); // adjust path if needed

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      dbName: process.env.DB_NAME
    });

    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Admin already exists:', existingAdmin.email);
      process.exit(0);
    }

    // Create admin
    const admin = await User.create({
      name: 'Super Admin',
      email: 'Admin@company.com',
      password: 'admin@123',       // pre-save hook will hash this automatically
      role: 'admin',
      employeeId: 'ADMIN001',
      department: 'Management',
      phoneNumber: '+919999999999',
      isActive: true
    });

    console.log('🎉 Admin created successfully!');
    console.log('📧 Email    :', admin.email);
    console.log('🔑 Password : admin@123  (change this after first login)');
    console.log('🪪 ID       :', admin._id);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

seedAdmin();