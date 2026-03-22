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

		if (!user.subscription) {
			return res.status(200).json({
				success: true,
				data: {
					plan: "free",
					status: "inactive",
					startDate: null,
					endDate: null,
				},
			});
		}

		const now = new Date();

		if (
			user.subscription.status === "active" &&
			user.subscription.endDate < now
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
// VERIFY SUBSCRIPTION (Called after native purchase)
// ===============================
// backend/controllers/subscriptionController.js
export const verifySubscription = async (req, res) => {
	try {
		const { transactionId, receipt, platform, productId } = req.body;

		// Map product ID to your internal plan
		const planMap = {
			monthly_basic: "basic",
			monthly_pro: "pro",
			quarterly_pro: "pro",
			yearly_pro: "pro",
		};

		const plan = planMap[productId] || "basic";

		// Verify with Apple or Google (using the receipt)
		let isValid = false;

		if (platform === "ios") {
			// Call Apple's verifyReceipt endpoint with the receipt
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
		} else if (platform === "android") {
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
		const expiry = new Date(now);

		// Set expiry based on product ID
		if (productId.includes("yearly")) {
			expiry.setFullYear(expiry.getFullYear() + 1);
		} else if (productId.includes("quarterly")) {
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

		res.json({ success: true, subscription: user.subscription });
	} catch (err) {
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
				private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
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

		if (user.subscription?.status !== "active") {
			return res
				.status(400)
				.json({ error: "No active subscription to cancel" });
		}

		// Update subscription status
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
