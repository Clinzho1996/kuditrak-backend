// backend/services/subscriptionSyncService.js
import mongoose from "mongoose";
import User from "../models/User.js";

// Initialize RevenueCat with your API key
// For backend, you need to use the REST API, not the SDK
// The SDK is for mobile apps, not Node.js backend

// Option 1: Use RevenueCat REST API directly
const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;
const REVENUECAT_API_URL = "https://api.revenuecat.com/v1";

const fetchCustomerInfo = async (userId) => {
	try {
		const response = await fetch(
			`${REVENUECAT_API_URL}/subscribers/${userId}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${REVENUECAT_API_KEY}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`RevenueCat API error: ${response.status}`);
		}

		const data = await response.json();
		return data.subscriber;
	} catch (error) {
		console.error("Error fetching from RevenueCat:", error.message);
		throw error;
	}
};

export const syncUserSubscription = async (userId, retries = 3) => {
	try {
		console.log(`🔄 Syncing subscription for user: ${userId}`);

		// Check if MongoDB is ready
		if (mongoose.connection.readyState !== 1) {
			console.log("⏳ MongoDB not ready, waiting...");
			await new Promise((resolve) => setTimeout(resolve, 2000));
			if (retries > 0) return syncUserSubscription(userId, retries - 1);
			return false;
		}

		// Fetch customer info from RevenueCat API
		const subscriber = await fetchCustomerInfo(userId);

		// Check entitlements
		const entitlements = subscriber.entitlements || {};
		const hasBasic = entitlements["Kuditrak Basic"]?.is_active === true;
		const hasPro = entitlements["Kuditrak Pro"]?.is_active === true;
		const hasActive = hasBasic || hasPro;

		let plan = "free";
		if (hasPro) {
			plan = "pro";
		} else if (hasBasic) {
			plan = "basic";
		}

		const activeEntitlement = hasPro
			? entitlements["Kuditrak Pro"]
			: hasBasic
				? entitlements["Kuditrak Basic"]
				: null;

		// Find and update user
		const user = await User.findById(userId);
		if (!user) {
			console.log(`User not found: ${userId}`);
			return false;
		}

		user.subscription = {
			plan,
			status: hasActive ? "active" : "expired",
			startDate: activeEntitlement?.purchase_date
				? new Date(activeEntitlement.purchase_date)
				: user.subscription?.startDate || new Date(),
			endDate: activeEntitlement?.expires_date
				? new Date(activeEntitlement.expires_date)
				: null,
			productId: activeEntitlement?.product_identifier,
			revenueCatId: userId,
			lastSyncAt: new Date(),
		};

		await user.save();

		console.log(`✅ Subscription synced for user ${userId}: ${plan}`);
		return true;
	} catch (err) {
		console.error(`Sync error for user ${userId}:`, err.message);
		if (retries > 0) {
			console.log(`Retrying... (${retries} attempts left)`);
			await new Promise((resolve) => setTimeout(resolve, 2000));
			return syncUserSubscription(userId, retries - 1);
		}
		return false;
	}
};

export const syncAllActiveSubscriptions = async () => {
	try {
		console.log("🔄 Starting bulk subscription sync...");

		// Wait for MongoDB to be ready
		let attempts = 0;
		while (mongoose.connection.readyState !== 1 && attempts < 10) {
			console.log("⏳ Waiting for MongoDB connection...");
			await new Promise((resolve) => setTimeout(resolve, 1000));
			attempts++;
		}

		if (mongoose.connection.readyState !== 1) {
			console.error("❌ MongoDB not ready after 10 seconds");
			return { synced: 0, failed: 0 };
		}

		// Find all users with active subscriptions in our DB
		const users = await User.find({ "subscription.status": "active" }).limit(
			50,
		);

		console.log(`Found ${users.length} active subscriptions to sync`);

		let synced = 0;
		let failed = 0;

		for (const user of users) {
			const success = await syncUserSubscription(user._id);
			if (success) synced++;
			else failed++;

			// Small delay between each sync to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		console.log(`✅ Bulk sync completed: ${synced} synced, ${failed} failed`);
		return { synced, failed };
	} catch (err) {
		console.error("Bulk sync error:", err);
		return { synced: 0, failed: 0 };
	}
};
