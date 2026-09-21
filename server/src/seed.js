import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import {
  Business,
  User,
  Group,
  Contact,
  Template,
  Campaign,
  Message,
  Suppression,
} from './models.js';

async function seed() {
  console.log('🌱 Starting Database Seeding process...');
  console.log(`📡 Connecting to MongoDB at: ${config.mongoUri}`);

  try {
    await mongoose.connect(config.mongoUri, config.mongo);
    console.log('✅ Connected to MongoDB successfully.');

    // 1. Clean existing seed business & user (or recreate clean slate)
    const demoEmail = 'demo@example.com';
    const existingUser = await User.findOne({ email: demoEmail });
    if (existingUser) {
      const businessId = existingUser.business;
      console.log('🧹 Cleaning up old demo data for business:', businessId);
      await Promise.all([
        User.deleteOne({ _id: existingUser._id }),
        Business.deleteOne({ _id: businessId }),
        Group.deleteMany({ business: businessId }),
        Contact.deleteMany({ business: businessId }),
        Template.deleteMany({ business: businessId }),
        Campaign.deleteMany({ business: businessId }),
        Message.deleteMany({ business: businessId }),
        Suppression.deleteMany({ business: businessId }),
      ]);
    }

    // 2. Create Business & User
    console.log('👤 Creating Demo Business & User...');
    const business = await Business.create({
      name: 'Demo E-Commerce Store',
      wabaId: '109283746554321',
      phoneNumberId: '987654321012345',
      displayPhone: '+91 98765 43210',
      accessTokenEnc: 'demo_mock_access_token',
      webhookSubscribed: true,
    });

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await User.create({
      email: demoEmail,
      passwordHash,
      name: 'Demo Admin',
      business: business._id,
    });

    console.log(`✅ Demo User created: ${user.email} (Password: password123)`);

    // 3. Create Groups
    console.log('🏷️  Creating Customer Groups (Segments)...');
    const groupVip = await Group.create({
      business: business._id,
      name: 'VIP Customers',
      description: 'High lifetime value customers with > $500 spend',
    });

    const groupRecent = await Group.create({
      business: business._id,
      name: 'Recent Buyers',
      description: 'Customers who purchased in the last 30 days',
    });

    const groupFestival = await Group.create({
      business: business._id,
      name: 'Festival Offer 2026',
      description: 'Leads opted in for seasonal discount broadcasts',
    });

    // 4. Create Contacts
    console.log('👥 Creating Dummy Contacts...');
    const dummyContactsData = [
      {
        name: 'Rahul Sharma',
        phone: '+919876543210',
        groups: [groupVip._id, groupRecent._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Mumbai'], ['orderId', 'ORD-1001'], ['discount', '20%']]),
      },
      {
        name: 'Priya Patel',
        phone: '+919812345678',
        groups: [groupRecent._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Ahmedabad'], ['orderId', 'ORD-1002'], ['discount', '15%']]),
      },
      {
        name: 'Amit Kumar',
        phone: '+919988776655',
        groups: [groupVip._id],
        optIn: { status: 'opted_in', source: 'website form', at: new Date() },
        customFields: new Map([['city', 'Delhi'], ['orderId', 'ORD-1003'], ['discount', '25%']]),
      },
      {
        name: 'Sneha Gupta',
        phone: '+919711223344',
        groups: [groupFestival._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Bangalore'], ['orderId', 'ORD-1004'], ['discount', '30%']]),
      },
      {
        name: 'Vikram Singh',
        phone: '+919655443322',
        groups: [groupRecent._id],
        optIn: { status: 'opted_in', source: 'website form', at: new Date() },
        customFields: new Map([['city', 'Jaipur'], ['orderId', 'ORD-1005'], ['discount', '10%']]),
      },
      {
        name: 'Ananya Roy',
        phone: '+919544332211',
        groups: [groupFestival._id, groupVip._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Kolkata'], ['orderId', 'ORD-1006'], ['discount', '20%']]),
      },
      {
        name: 'Rohan Verma',
        phone: '+919433221100',
        groups: [groupVip._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Pune'], ['orderId', 'ORD-1007'], ['discount', '25%']]),
      },
      {
        name: 'Kavya Iyer',
        phone: '+919322110099',
        groups: [groupFestival._id],
        optIn: { status: 'opted_in', source: 'website form', at: new Date() },
        customFields: new Map([['city', 'Chennai'], ['orderId', 'ORD-1008'], ['discount', '15%']]),
      },
      {
        name: 'Siddharth Mehta',
        phone: '+919211009988',
        groups: [groupRecent._id],
        optIn: { status: 'opted_in', source: 'excel import', at: new Date() },
        customFields: new Map([['city', 'Hyderabad'], ['orderId', 'ORD-1009'], ['discount', '10%']]),
      },
      {
        name: 'Neha Sharma (Opted Out)',
        phone: '+919812345600',
        groups: [groupRecent._id],
        optIn: { status: 'opted_out', source: 'inbound STOP message', at: new Date() },
        customFields: new Map([['city', 'Delhi'], ['orderId', 'ORD-1010'], ['discount', '0%']]),
      },
    ];

    const insertedContacts = await Contact.insertMany(
      dummyContactsData.map((c) => ({ ...c, business: business._id }))
    );
    console.log(`✅ Created ${insertedContacts.length} Contacts with groups and custom fields.`);

    // Add suppression record for opted out user
    await Suppression.create({
      business: business._id,
      phone: '+919812345600',
      reason: 'User sent STOP reply',
      source: 'inbound STOP',
    });

    // 5. Create Templates
    console.log('📝 Creating Meta Templates...');
    const tplWelcome = await Template.create({
      business: business._id,
      name: 'welcome_offer',
      language: 'en',
      category: 'MARKETING',
      headerText: 'Special Welcome Offer 🎉',
      bodyText: 'Hi {{1}}, welcome to Demo Store! Enjoy {{2}} off on your next order in {{3}}.',
      footerText: 'Reply STOP to unsubscribe',
      metaTemplateId: 'meta_tpl_101',
      status: 'APPROVED',
    });

    const tplOrder = await Template.create({
      business: business._id,
      name: 'order_update',
      language: 'en',
      category: 'UTILITY',
      headerText: 'Order Update 📦',
      bodyText: 'Hello {{1}}, your order {{2}} has been shipped to {{3}}. Track your package in your account dashboard.',
      footerText: 'Thank you for shopping with us!',
      metaTemplateId: 'meta_tpl_102',
      status: 'APPROVED',
    });

    const tplDraft = await Template.create({
      business: business._id,
      name: 'festival_flash_sale',
      language: 'en',
      category: 'MARKETING',
      headerText: 'Flash Sale Alert ⚡',
      bodyText: 'Hey {{1}}, 50% discount on all items in {{2}} for the next 24 hours!',
      footerText: 'Terms & conditions apply',
      status: 'DRAFT',
    });

    console.log(`✅ Created 3 Templates (2 Approved, 1 Draft).`);

    // 6. Create Campaigns & Sample Broadcast Messages
    console.log('📢 Creating Demo Campaign & Analytics Messages...');
    const campaignCompleted = await Campaign.create({
      business: business._id,
      name: 'VIP Welcome Broadcast 2026',
      group: groupVip._id,
      template: tplWelcome._id,
      variableMapping: new Map([
        ['1', 'name'],
        ['2', 'customFields.discount'],
        ['3', 'customFields.city'],
      ]),
      status: 'completed',
      stats: {
        total: 4,
        skippedNoConsent: 0,
        queued: 0,
        sent: 1,
        delivered: 1,
        read: 2,
        failed: 0,
      },
      sentAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    });

    // Message status records for report analytics chart
    const vipContacts = insertedContacts.filter((c) => c.groups.includes(groupVip._id));
    const statuses = ['read', 'read', 'delivered', 'sent'];

    const messagesToInsert = vipContacts.map((contact, idx) => ({
      campaign: campaignCompleted._id,
      business: business._id,
      contact: contact._id,
      phone: contact.phone,
      metaMessageId: `wamid.HBgL${Math.random().toString(36).substr(2, 12)}`,
      status: statuses[idx % statuses.length],
      sentAt: new Date(Date.now() - 3600000 * 2),
      deliveredAt: new Date(Date.now() - 3600000 * 1.8),
      readAt: idx % 2 === 0 ? new Date(Date.now() - 3600000 * 1.5) : undefined,
      idempotencyKey: `${campaignCompleted._id}:${contact._id}`,
    }));

    await Message.insertMany(messagesToInsert);

    // Create a draft campaign ready to send
    await Campaign.create({
      business: business._id,
      name: 'Recent Buyers Shipping Updates',
      group: groupRecent._id,
      template: tplOrder._id,
      variableMapping: new Map([
        ['1', 'name'],
        ['2', 'customFields.orderId'],
        ['3', 'customFields.city'],
      ]),
      status: 'draft',
      stats: { total: 0, skippedNoConsent: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    });

    console.log(`✅ Campaign & Messages seeded successfully.`);

    console.log('\n======================================================');
    console.log('🎉 DEMO DATA SEEDED SUCCESSFULLY!');
    console.log('======================================================');
    console.log('🔑 Login Credentials:');
    console.log(`   Email:    ${demoEmail}`);
    console.log('   Password: password123');
    console.log('\n📁 Upload Files created for Excel/CSV Import UI testing:');
    console.log('   1. server/test/data/dummy_contacts_clean.csv');
    console.log('   2. server/test/data/dummy_contacts_edge_cases.csv');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Error during seeding process:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

seed();
