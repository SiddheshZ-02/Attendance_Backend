require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan');

const clearAndRecreatePlans = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ems');
    console.log('✅ Connected to MongoDB');

    // Delete all existing plans
    const deleted = await Plan.deleteMany({});
    console.log(`🗑️  Deleted ${deleted.deletedCount} existing plans`);

    // Create fresh default plans
    const defaultPlans = [
      {
        name: 'Free Trial',
        key: 'free',
        price: 0,
        maxEmployees: 25,
        maxAdmins: 1,
        features: ['All features unlocked', '15 days trial'],
        isActive: true,
        sortOrder: 0,
      },
      {
        name: 'Basic Plan',
        key: 'basic',
        price: 999,
        maxEmployees: 50,
        maxAdmins: 2,
        features: [
          'Employee Management',
          'Leave Tracking',
          'Basic Reports',
          'Email Support',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Pro Plan',
        key: 'pro',
        price: 2499,
        maxEmployees: 200,
        maxAdmins: 5,
        features: [
          'Up to 200 employees INCLUDED',
          '₹15 per extra employee',
          'Priority Support',
          'Custom Branding',
          'Advanced Analytics',
        ],
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Premium Plan',
        key: 'premium',
        price: 4999,
        maxEmployees: 500,
        maxAdmins: 10,
        features: [
          'Up to 500 employees INCLUDED',
          '₹10 per extra employee',
          'Dedicated Manager',
          'API Access',
          'SLA 99.9%',
          'Custom Integrations',
        ],
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Enterprise',
        key: 'enterprise',
        price: 9999,
        maxEmployees: 999999,
        maxAdmins: 25,
        features: [
          'Unlimited employees',
          'White Label',
          'Multi-Branch',
          '24/7 Support',
          'Custom Integrations',
          'Dedicated Infrastructure',
        ],
        isActive: true,
        sortOrder: 4,
      },
    ];

    const createdPlans = await Plan.insertMany(defaultPlans);
    console.log(`✅ Created ${createdPlans.length} new plans:`);
    createdPlans.forEach((plan, idx) => {
      console.log(`  ${idx + 1}. ${plan.name} (ID: ${plan._id})`);
    });

    console.log('\n✅ Done! Plans have been recreated with proper IDs.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

clearAndRecreatePlans();
