// backend/scripts/migratePushTokens.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

// Load environment variables
dotenv.config();

const migratePushTokens = async () => {
	try {
		console.log("🔄 Starting push token migration...");

		// Connect to MongoDB
		await mongoose.connect(process.env.MONGO_URI);
		console.log("✅ Connected to MongoDB");

		// Find users with old pushToken field
		const users = await User.find({ pushToken: { $exists: true, $ne: null } });

		console.log(`Found ${users.length} users with old pushToken`);

		let migrated = 0;
		let skipped = 0;

		for (const user of users) {
			try {
				// Initialize pushTokens if it doesn't exist
				if (!user.pushTokens) {
					user.pushTokens = [];
				}

				// Check if token already exists in pushTokens
				const exists = user.pushTokens.some((t) => t.token === user.pushToken);

				if (!exists && user.pushToken) {
					user.pushTokens.push({
						token: user.pushToken,
						platform: "ios", // Default, adjust if needed
						deviceId: null,
						createdAt: user.createdAt || new Date(),
						lastUsed: new Date(),
					});
					migrated++;
				} else {
					skipped++;
				}

				// Clear the old field
				user.pushToken = undefined;
				await user.save();
			} catch (userError) {
				console.error(`Error migrating user ${user._id}:`, userError.message);
			}
		}

		console.log(
			`✅ Migration completed: ${migrated} migrated, ${skipped} skipped`,
		);

		// Also update the model schema for new users
		await User.updateMany(
			{ pushTokens: { $exists: false } },
			{ $set: { pushTokens: [] } },
		);

		console.log("✅ Added pushTokens array to all users");

		await mongoose.disconnect();
		console.log("✅ Disconnected from MongoDB");
		process.exit(0);
	} catch (err) {
		console.error("❌ Migration error:", err);
		await mongoose.disconnect();
		process.exit(1);
	}
};

migratePushTokens();
