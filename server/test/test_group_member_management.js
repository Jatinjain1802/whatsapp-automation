import { test } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { Business, Group, Contact } from '../src/models.js';

test('Group Member Management DB Operations', async (t) => {
  await mongoose.connect(config.mongoUri, config.mongo);

  let testBusiness;
  let testGroup;
  let contact1;
  let contact2;

  t.beforeEach(async () => {
    testBusiness = await Business.create({ name: 'Test Corp Member Mgmt' });
    testGroup = await Group.create({ business: testBusiness._id, name: 'VIP Group' });
    contact1 = await Contact.create({ business: testBusiness._id, name: 'Alice Test', phone: '+919999900001' });
    contact2 = await Contact.create({ business: testBusiness._id, name: 'Bob Test', phone: '+919999900002' });
  });

  t.afterEach(async () => {
    if (testBusiness) {
      await Business.deleteOne({ _id: testBusiness._id });
      await Group.deleteMany({ business: testBusiness._id });
      await Contact.deleteMany({ business: testBusiness._id });
    }
  });

  await t.test('1. Add contacts to existing group via $addToSet', async () => {
    const contactIds = [contact1._id, contact2._id];
    await Contact.updateMany(
      { _id: { $in: contactIds }, business: testBusiness._id },
      { $addToSet: { groups: testGroup._id } }
    );

    const updatedContact1 = await Contact.findById(contact1._id);
    const updatedContact2 = await Contact.findById(contact2._id);

    assert.ok(updatedContact1.groups.map((g) => g.toString()).includes(testGroup._id.toString()));
    assert.ok(updatedContact2.groups.map((g) => g.toString()).includes(testGroup._id.toString()));
  });

  await t.test('2. Fetch contacts belonging to group', async () => {
    await Contact.updateOne({ _id: contact1._id }, { $addToSet: { groups: testGroup._id } });

    const groupMembers = await Contact.find({
      business: testBusiness._id,
      groups: testGroup._id,
    }).lean();

    assert.strictEqual(groupMembers.length, 1);
    assert.strictEqual(groupMembers[0].name, 'Alice Test');
  });

  await t.test('3. Unlink contact from group via $pull', async () => {
    await Contact.updateOne({ _id: contact1._id }, { $addToSet: { groups: testGroup._id } });

    await Contact.updateOne(
      { _id: contact1._id, business: testBusiness._id },
      { $pull: { groups: testGroup._id } }
    );

    const updatedContact1 = await Contact.findById(contact1._id);
    assert.strictEqual(
      updatedContact1.groups.map((g) => g.toString()).includes(testGroup._id.toString()),
      false
    );
  });

  t.after(async () => {
    await mongoose.disconnect();
  });
});
