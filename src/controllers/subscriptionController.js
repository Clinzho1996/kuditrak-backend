// backend/controllers/subscriptionController.js
import User from "../models/User.js";

// ===============================
// GET CURRENT SUBSCRIPTION
// ===============================
export const getSubscription = async (req, res) => {
	try {
		const userId = req.user._id;

		const user = await User.findById(userId).select("subscription");

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// If no subscription exists, return free plan
		if (!user.subscription) {
			return res.status(200).json({
				success: true,
				data: {
					plan: "free",
					status: "active",
					startDate: null,
					endDate: null,
				},
			});
		}

		const now = new Date();

		// Check if subscription has expired
		if (
			user.subscription.status === "active" &&
			user.subscription.endDate &&
			new Date(user.subscription.endDate) < now
		) {
			user.subscription.status = "expired";
			await user.save();
		}

		return res.status(200).json({
			success: true,
			data: user.subscription,
		});
	} catch (err) {
		console.error("Get Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};

// ===============================
// SYNC SUBSCRIPTION FROM REVENUECAT
// ===============================
export const syncSubscription = async (req, res) => {
	try {
		const { plan, productId, revenueCatId, startDate, endDate } = req.body;
		const userId = req.user._id;

		console.log("Syncing subscription:", {
			plan,
			productId,
			revenueCatId,
			startDate,
			endDate,
		});

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Update user's subscription
		user.subscription = {
			plan: plan, // "free", "basic", or "pro"
			status: "active",
			startDate: startDate ? new Date(startDate) : new Date(),
			endDate: endDate
				? new Date(endDate)
				: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
		};

		// Save the updated user
		await user.save();

		console.log("User subscription updated:", user.subscription);

		return res.status(200).json({
			success: true,
			message: "Subscription synced successfully",
			data: user.subscription,
		});
	} catch (err) {
		console.error("Sync Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};

// ===============================
// VERIFY SUBSCRIPTION (Called after native purchase - Legacy, kept for compatibility)
// ===============================
export const verifySubscription = async (req, res) => {
	try {
		const { transactionId, receipt, platform, plan, productId } = req.body;

		console.log("Verifying subscription:", {
			transactionId,
			platform,
			plan,
			productId,
		});

		// For RevenueCat Test Store, we don't need to verify with Apple/Google
		// The receipt is simulated, so we just trust it
		let isValid = true;

		// If it's a real receipt, verify with Apple or Google
		if (platform === "ios" && receipt && receipt.length > 100) {
			// Call Apple's verifyReceipt endpoint
			const verifyResponse = await fetch(
				"https://buy.itunes.apple.com/verifyReceipt",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						"receipt-data": receipt,
						password: process.env.APPLE_SHARED_SECRET,
					}),
				},
			);
			const result = await verifyResponse.json();
			isValid = result.status === 0;

			if (!isValid) {
				console.error("Invalid receipt:", result);
				return res.status(400).json({ error: "Invalid receipt" });
			}
		} else if (platform === "android" && receipt && receipt.length > 50) {
			// Call Google's API with the purchase token
			const token = await getGooglePlayAccessToken();
			const verifyResponse = await fetch(
				`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${process.env.GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${receipt}`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			const result = await verifyResponse.json();
			isValid = result.purchaseState === 0;
		}

		if (!isValid) {
			return res.status(400).json({ error: "Invalid receipt" });
		}

		// Update user subscription in your database
		const user = await User.findById(req.user._id);
		const now = new Date();
		let expiry = new Date(now);

		// Set expiry based on product ID
		if (productId === "yearly" || productId.includes("yearly")) {
			expiry.setFullYear(expiry.getFullYear() + 1);
		} else if (productId === "three_month" || productId.includes("quarterly")) {
			expiry.setMonth(expiry.getMonth() + 3);
		} else {
			expiry.setMonth(expiry.getMonth() + 1);
		}

		user.subscription = {
			plan: plan,
			status: "active",
			startDate: now,
			endDate: expiry,
		};
		await user.save();

		console.log("Subscription verified and updated:", user.subscription);

		res.json({
			success: true,
			message: "Subscription verified successfully",
			data: user.subscription,
		});
	} catch (err) {
		console.error("Verify subscription error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// GET GOOGLE PLAY ACCESS TOKEN
// ===============================
const getGooglePlayAccessToken = async () => {
	try {
		const { GoogleAuth } = await import("google-auth-library");

		const auth = new GoogleAuth({
			credentials: {
				client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
				private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			},
			scopes: ["https://www.googleapis.com/auth/androidpublisher"],
		});

		const client = await auth.getClient();
		const accessToken = await client.getAccessToken();

		return accessToken.token;
	} catch (error) {
		console.error("Error getting Google Play access token:", error);
		throw error;
	}
};

// ===============================
// CANCEL SUBSCRIPTION
// ===============================
export const cancelSubscription = async (req, res) => {
	try {
		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (!user.subscription || user.subscription.status !== "active") {
			return res
				.status(400)
				.json({ error: "No active subscription to cancel" });
		}

		// Update subscription status to cancelled
		user.subscription.status = "cancelled";
		await user.save();

		return res.status(200).json({
			success: true,
			message:
				"Subscription cancelled successfully. You'll have access until the end of your billing period.",
			data: user.subscription,
		});
	} catch (err) {
		console.error("Cancel Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};

// ===============================
// GET SUBSCRIPTION STATUS (For frontend)
// ===============================
export const getSubscriptionStatus = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select("subscription");

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const now = new Date();
		let subscription = user.subscription || {
			plan: "free",
			status: "active",
			startDate: null,
			endDate: null,
		};

		// Check if subscription has expired
		if (
			subscription.status === "active" &&
			subscription.endDate &&
			new Date(subscription.endDate) < now
		) {
			subscription.status = "expired";
			await user.save();
		}

		return res.status(200).json({
			success: true,
			data: subscription,
		});
	} catch (err) {
		console.error("Get Subscription Status Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};
