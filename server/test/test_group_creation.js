import mongoose from "mongoose";
import { Group, Contact, User } from "../src/models.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
async function testGroupCreation() {
  console.log("📡 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected.");

  try {
    const user = await User.findOne({ email: "demo@example.com" });
    if (!user) {
      console.log("❌ Demo user not found.");
      return;
    }
    const businessId = user.business;
    console.log("🏢 Business ID:", businessId);

    const totalContacts = await Contact.countDocuments({
      business: businessId,
    });
    console.log(`📊 Total available contacts for business: ${totalContacts}`);

    // Test creating a group with 3 contacts
    const groupName = `Test Group ${Date.now()}`;
    const limitNum = 3;

    console.log(
      `🔨 Creating group "${groupName}" with ${limitNum} contacts...`,
    );
    const group = await Group.create({ business: businessId, name: groupName });

    const targetContacts = await Contact.find({ business: businessId })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select("_id")
      .lean();

    const targetIds = targetContacts.map((c) => c._id);
    console.log(`🎯 Target Contact IDs to assign:`, targetIds);

    await Contact.updateMany(
      { _id: { $in: targetIds } },
      { $addToSet: { groups: group._id } },
    );

    const assignedCount = await Contact.countDocuments({
      business: businessId,
      groups: group._id,
    });
    console.log(
      `✅ Group created successfully! Contacts in group: ${assignedCount}`,
    );

    if (assignedCount === limitNum) {
      console.log(
        "🎉 TEST PASSED! Assigned contact count matches requested limit.",
      );
    } else {
      console.error(
        `❌ TEST FAILED! Expected ${limitNum}, got ${assignedCount}`,
      );
    }
  } catch (err) {
    console.error("❌ Error during test:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected.");
  }
}

testGroupCreation();
