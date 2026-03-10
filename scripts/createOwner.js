const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('../config/database');
const User = require('../models/User');

const run = async () => {
  try {
    await connectDB();

    const email = 'siddheshzujam111@gmail.com';

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log('Owner user already exists with this email:', email);
      process.exit(0);
    }

    const owner = await User.create({
      name: 'Siddhesh Zujam',
      email,
      password: 'Siddhesh@11',
      role: 'owner',
      isActive: true,
    });

    console.log('Owner user created with id:', owner._id.toString());
    process.exit(0);
  } catch (error) {
    console.error('Failed to create owner user:', error.message);
    process.exit(1);
  }
};

run();

