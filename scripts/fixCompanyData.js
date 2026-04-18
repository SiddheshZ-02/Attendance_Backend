const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
require('dotenv').config();

const fixCompanyData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      dbName: process.env.DB_NAME || 'EMS_DB'
    });
    
    console.log('\n🔧 FIXING COMPANY DATA\n');
    console.log('═'.repeat(60));
    
    const owner = await User.findOne({ role: 'owner' }).lean();
    console.log(`\n👤 Owner: ${owner.name} (${owner.email})`);
    console.log(`   Owner ID: ${owner._id}`);
    
    // Find the company
    const company = await Company.findOne({ name: 'ABC Company' });
    console.log(`\n🏢 Found company: ${company.name}`);
    console.log(`   Current isDeleted: ${company.isDeleted}`);
    console.log(`   Current status: ${company.status || 'undefined'}`);
    console.log(`   Current subscription: ${JSON.stringify(company.subscription || {})}`);
    
    // Fix all missing fields
    console.log('\n🔧 Applying fixes...');
    
    company.isDeleted = false;
    company.status = 'active';
    
    // Add subscription if missing
    if (!company.subscription || Object.keys(company.subscription).length === 0) {
      company.subscription = {
        plan: 'free',
        status: 'active',
        startDate: new Date(),
        renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        amount: 0,
        currency: 'INR',
        employeeCount: 0,
        maxEmployees: 25,
      };
      console.log('   ✅ Added subscription data');
    }
    
    // Ensure ownerId is set
    if (!company.ownerId) {
      company.ownerId = owner._id;
      console.log('   ✅ Set ownerId');
    }
    
    await company.save();
    
    console.log('\n✅ Company updated successfully!');
    console.log(`   isDeleted: ${company.isDeleted}`);
    console.log(`   status: ${company.status}`);
    console.log(`   subscription.status: ${company.subscription.status}`);
    console.log(`   subscription.plan: ${company.subscription.plan}`);
    
    // Verify the query works now
    console.log('\n🧪 Verifying dashboard query...');
    const result = await Company.find({
      ownerId: owner._id,
      isDeleted: false
    }).lean();
    
    console.log(`   Query result: ${result.length} company(ies) found`);
    
    if (result.length > 0) {
      console.log('\n🎉 SUCCESS! Company should now show in owner dashboard!');
      console.log(`   Company: ${result[0].name}`);
    } else {
      console.log('\n❌ Still not working. Checking query details...');
      
      // Try without isDeleted filter
      const result2 = await Company.find({
        ownerId: owner._id
      }).lean();
      
      console.log(`   Without isDeleted filter: ${result2.length} companies`);
      
      if (result2.length > 0) {
        console.log(`   isDeleted value: ${result2[0].isDeleted}`);
        console.log(`   Type: ${typeof result2[0].isDeleted}`);
        
        // Force update with MongoDB native update
        await Company.updateOne(
          { _id: result2[0]._id },
          { $set: { isDeleted: false } }
        );
        
        console.log('   ✅ Forced update with $set');
        
        // Verify again
        const result3 = await Company.find({
          ownerId: owner._id,
          isDeleted: false
        }).lean();
        
        console.log(`   Final verification: ${result3.length} companies`);
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ FIX COMPLETE\n');
    console.log('📋 NEXT STEPS:');
    console.log('   1. Restart backend server (if running)');
    console.log('   2. Refresh owner dashboard in browser');
    console.log('   3. Company data should now appear!\n');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

fixCompanyData();

