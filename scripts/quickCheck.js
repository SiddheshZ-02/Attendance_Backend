const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
require('dotenv').config();

const quickCheck = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      dbName: process.env.DB_NAME || 'EMS_DB'
    });
    
    console.log('\n🔍 QUICK DATABASE CHECK\n');
    console.log('═'.repeat(60));
    
    // 1. Check all users
    const users = await User.find({}).select('name email role isActive').lean();
    console.log(`\n👥 USERS (${users.length} total):`);
    users.forEach((u, i) => {
      console.log(`   ${i+1}. ${u.name} | ${u.email} | Role: ${u.role} | Active: ${u.isActive}`);
    });
    
    // 2. Check all companies
    const companies = await Company.find({}).lean();
    console.log(`\n🏢 COMPANIES (${companies.length} total):`);
    companies.forEach((c, i) => {
      console.log(`   ${i+1}. ${c.name}`);
      console.log(`      ID: ${c._id}`);
      console.log(`      Owner ID: ${c.ownerId || 'MISSING'}`);
      console.log(`      isDeleted: ${c.isDeleted}`);
      console.log(`      Status: ${c.status}`);
      console.log(`      Subscription: ${JSON.stringify(c.subscription || {})}`);
      console.log('');
    });
    
    // 3. Find owner and their companies
    const owner = await User.findOne({ role: 'owner' }).lean();
    if (owner) {
      console.log(`\n👤 OWNER FOUND:`);
      console.log(`   Name: ${owner.name}`);
      console.log(`   Email: ${owner.email}`);
      console.log(`   ID: ${owner._id}`);
      
      const ownerCompanies = await Company.find({ 
        ownerId: owner._id,
        isDeleted: false 
      }).lean();
      
      console.log(`\n📊 OWNER COMPANIES (${ownerCompanies.length} found):`);
      ownerCompanies.forEach((c, i) => {
        console.log(`   ${i+1}. ${c.name}`);
      });
      
      // Test the exact query dashboard uses
      console.log('\n🧪 TESTING DASHBOARD QUERY:');
      console.log(`   Query: Company.find({ ownerId: "${owner._id}", isDeleted: false })`);
      console.log(`   Result: ${ownerCompanies.length} companies`);
      
      if (ownerCompanies.length === 0) {
        console.log('\n⚠️  PROBLEM: No companies found for this owner!');
        
        // Check if companies exist but with wrong ownerId
        const companiesWithDifferentOwner = await Company.find({
          ownerId: { $ne: owner._id },
          isDeleted: false
        }).lean();
        
        console.log(`\n   Companies with DIFFERENT ownerId: ${companiesWithDifferentOwner.length}`);
        companiesWithDifferentOwner.forEach((c, i) => {
          console.log(`   ${i+1}. ${c.name} | Owner: ${c.ownerId}`);
        });
        
        // Check if companies exist but deleted
        const deletedCompanies = await Company.find({
          ownerId: owner._id,
          isDeleted: true
        }).lean();
        
        console.log(`\n   Deleted companies: ${deletedCompanies.length}`);
        deletedCompanies.forEach((c, i) => {
          console.log(`   ${i+1}. ${c.name} | isDeleted: true`);
        });
        
        // FIX: Update all non-deleted companies to this owner
        if (companiesWithDifferentOwner.length > 0) {
          console.log('\n🔧 AUTO-FIX: Updating all companies to this owner...');
          await Company.updateMany(
            { isDeleted: false },
            { $set: { ownerId: owner._id } }
          );
          console.log('   ✅ All companies updated!');
          
          // Verify
          const verifyCount = await Company.countDocuments({
            ownerId: owner._id,
            isDeleted: false
          });
          console.log(`   ✅ Verified: ${verifyCount} companies now owned`);
        }
      }
    } else {
      console.log('\n❌ NO OWNER USER FOUND!');
      console.log('\n🔧 Creating owner user...');
      
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('Owner@123', 10);
      
      const newOwner = new User({
        name: 'Platform Owner',
        email: 'owner@ems.com',
        password: hashedPassword,
        role: 'owner',
        isActive: true,
      });
      
      await newOwner.save();
      console.log('   ✅ Owner created: owner@ems.com / Owner@123');
      console.log(`   ✅ Owner ID: ${newOwner._id}`);
      
      // Assign all companies to new owner
      if (companies.length > 0) {
        console.log('\n🔧 Assigning all companies to new owner...');
        await Company.updateMany(
          { isDeleted: false },
          { $set: { ownerId: newOwner._id } }
        );
        console.log(`   ✅ Updated ${companies.length} companies`);
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ CHECK COMPLETE\n');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

quickCheck();

