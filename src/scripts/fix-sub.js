// scripts/fixSubscriptionData.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();
const fixSubscriptionData = async () => {
	try {
		await mongoose.connect(process.env.MONGO_URI);

		// User who paid (Confidence)
		const payingUser = await User.findOne({ email: "confidinho@yahoo.com" });
		// User who got the subscription (Kuditrak)
		const wrongUser = await User.findOne({ email: "hello@kuditrak.com" });

		console.log("Paying user:", {
			id: payingUser._id,
			email: payingUser.email,
			currentPlan: payingUser.subscription?.plan,
		});

		console.log("Wrong user:", {
			id: wrongUser._id,
			email: wrongUser.email,
			currentPlan: wrongUser.subscription?.plan,
		});

		// Set the correct RevenueCat App User ID for the paying user
		// Use the RevenueCat ID from the dashboard
		const correctRevenueCatId = "69d504688070ab788fd15634"; // This is Confidence's RevenueCat ID

		payingUser.revenueCatAppUserId = correctRevenueCatId;

		// If the paying user doesn't have the subscription, move it
		if (payingUser.subscription?.plan !== "basic") {
			payingUser.subscription = {
				...wrongUser.subscription,
				revenueCatId: correctRevenueCatId,
				lastSyncAt: new Date(),
			};
		}

		await payingUser.save();

		// Clear the wrong user's subscription
		wrongUser.revenueCatAppUserId = null;
		wrongUser.subscription = {
			plan: "free",
			status: "active",
		};
		await wrongUser.save();

		console.log("✅ Fixed RevenueCat mapping");
		console.log(
			`Paying user now has RevenueCat ID: ${payingUser.revenueCatAppUserId}`,
		);
		console.log(`Paying user subscription: ${payingUser.subscription?.plan}`);
		console.log(
			`Wrong user subscription cleared: ${wrongUser.subscription?.plan}`,
		);

		await mongoose.disconnect();
	} catch (error) {
		console.error("Error:", error);
	}
};

fixSubscriptionData();
