const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
require('dotenv').config();

const diagnoseAndFix = async () => {
  try {
    console.log('🔍 DIAGNOSTIC STARTING...\n');
    
    await mongoose.connect(process.env.MONGO_URL, {
      dbName: process.env.DB_NAME || 'EMS_DB'
    });
    console.log('✅ MongoDB Connected\n');

    // Step 1: Check all users
    console.log('═══════════════════════════════════════════');
    console.log('📋 STEP 1: Checking all users in database');
    console.log('═══════════════════════════════════════════\n');
    
    const allUsers = await User.find({}).select('name email role isActive').lean();
    console.log(`Total users found: ${allUsers.length}\n`);
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} | ${user.email} | Role: ${user.role} | Active: ${user.isActive}`);
    });

    // Step 2: Find owner users
    console.log('\n═══════════════════════════════════════════');
    console.log('👤 STEP 2: Finding owner users');
    console.log('═══════════════════════════════════════════\n');
    
    const owners = await User.find({ role: 'owner' }).lean();
    
    if (owners.length === 0) {
      console.log('❌ NO OWNER USER FOUND!');
      console.log('\n🔧 Creating a default owner user...\n');
      
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
      console.log('✅ Owner user created!');
      console.log(`   Email: owner@ems.com`);
      console.log(`   Password: Owner@123`);
      console.log(`   Owner ID: ${newOwner._id}\n`);
      
      owners.push(newOwner);
    } else {
      console.log(`✅ Found ${owners.length} owner(s):\n`);
      owners.forEach((owner, index) => {
        console.log(`${index + 1}. ${owner.name} | ${owner.email} | ID: ${owner._id}`);
      });
    }

    // Step 3: Check all companies
    console.log('\n═══════════════════════════════════════════');
    console.log('🏢 STEP 3: Checking all companies');
    console.log('═══════════════════════════════════════════\n');
    
    const allCompanies = await Company.find({}).lean();
    console.log(`Total companies found: ${allCompanies.length}\n`);
    
    if (allCompanies.length === 0) {
      console.log('⚠️  NO COMPANIES IN DATABASE!');
      console.log('You need to create a company first using the owner dashboard.\n');
      await mongoose.disconnect();
      return;
    }

    allCompanies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.name}`);
      console.log(`   ID: ${company._id}`);
      console.log(`   Owner ID: ${company.ownerId || 'NOT SET'}`);
      console.log(`   Status: ${company.status || 'N/A'}`);
      console.log(`   Subscription: ${company.subscription?.status || 'N/A'}`);
      console.log(`   Plan: ${company.subscription?.plan || company.plan || 'N/A'}`);
      console.log('');
    });

    // Step 4: Fix companies without ownerId
    console.log('═══════════════════════════════════════════');
    console.log('🔧 STEP 4: Fixing companies without ownerId');
    console.log('═══════════════════════════════════════════\n');
    
    const companiesWithoutOwner = await Company.find({
      $or: [
        { ownerId: { $exists: false } },
        { ownerId: null },
      ]
    });

    console.log(`Found ${companiesWithoutOwner.length} companies without ownerId\n`);

    if (companiesWithoutOwner.length > 0) {
      const primaryOwner = owners[0];
      
      for (const company of companiesWithoutOwner) {
        console.log(`🔄 Updating: ${company.name}`);
        company.ownerId = primaryOwner._id;
        await company.save();
        console.log(`   ✅ Assigned to: ${primaryOwner.name}\n`);
      }

      console.log(`✅ Successfully updated ${companiesWithoutOwner.length} companies\n`);
    } else {
      console.log('✅ All companies already have ownerId assigned\n');
    }

    // Step 5: Verify ownership
    console.log('═══════════════════════════════════════════');
    console.log('✅ STEP 5: Verification');
    console.log('═══════════════════════════════════════════\n');
    
    for (const owner of owners) {
      const ownerCompanies = await Company.find({ ownerId: owner._id, isDeleted: false }).lean();
      console.log(`${owner.name} (${owner.email}):`);
      console.log(`  Companies owned: ${ownerCompanies.length}\n`);
      
      ownerCompanies.forEach((company, index) => {
        console.log(`  ${index + 1}. ${company.name}`);
        console.log(`     Status: ${company.subscription?.status || company.status}`);
        console.log(`     Plan: ${company.subscription?.plan || 'N/A'}`);
        console.log(`     Employees: ${company.subscription?.employeeCount || 0}`);
        console.log('');
      });
    }

    // Step 6: Test query that owner dashboard uses
    console.log('═══════════════════════════════════════════');
    console.log('🧪 STEP 6: Testing owner dashboard query');
    console.log('═══════════════════════════════════════════\n');
    
    const primaryOwner = owners[0];
    const dashboardCompanies = await Company.find({ 
      ownerId: primaryOwner._id, 
      isDeleted: false 
    }).lean();

    console.log(`Query: Company.find({ ownerId: "${primaryOwner._id}", isDeleted: false })`);
    console.log(`Result: ${dashboardCompanies.length} companies found\n`);

    if (dashboardCompanies.length > 0) {
      console.log('✅ DATA SHOULD NOW SHOW IN OWNER DASHBOARD!\n');
      console.log('Companies that will appear:');
      dashboardCompanies.forEach((company, index) => {
        console.log(`  ${index + 1}. ${company.name}`);
      });
    } else {
      console.log('❌ Still no data! Check if isDeleted is set to true\n');
      
      const deletedCompanies = await Company.find({ 
        ownerId: primaryOwner._id, 
        isDeleted: true 
      }).lean();
      
      if (deletedCompanies.length > 0) {
        console.log(`Found ${deletedCompanies.length} deleted companies:`);
        deletedCompanies.forEach((company, index) => {
          console.log(`  ${index + 1}. ${company.name} (isDeleted: true)`);
        });
        console.log('\n🔧 Fixing: Setting isDeleted to false...\n');
        
        await Company.updateMany(
          { ownerId: primaryOwner._id, isDeleted: true },
          { $set: { isDeleted: false } }
        );
        
        console.log('✅ Fixed! Companies should now show.\n');
      }
    }

    console.log('═══════════════════════════════════════════');
    console.log('🎯 NEXT STEPS');
    console.log('═══════════════════════════════════════════\n');
    console.log('1. Login to frontend with owner credentials:');
    console.log(`   Email: ${primaryOwner.email}`);
    console.log(`   Password: ${owners[0].password ? 'Use existing password' : 'Owner@123 (for new owner)'}`);
    console.log('\n2. Navigate to /owner/dashboard');
    console.log('\n3. If still not showing, check browser console for errors');
    console.log('\n4. Verify token in localStorage (ems_token or token)');
    console.log('\n═══════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Database disconnected\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

diagnoseAndFix();