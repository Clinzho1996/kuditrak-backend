// backend/controllers/subscriptionController.js
import User from "../models/User.js";

// ===============================
// CLEAN DATABASE - Remove all free subscriptions
// ===============================
export const cleanDatabase = async (req, res) => {
	try {
		// Remove subscription from ALL free users
		const result = await User.updateMany(
			{ "subscription.plan": "free" },
			{ $unset: { subscription: "" } },
		);

		// Also remove any users with subscription but no plan
		const result2 = await User.updateMany(
			{ "subscription.plan": { $exists: false } },
			{ $unset: { subscription: "" } },
		);

		// For paid users, ensure they have endDate
		const paidUsers = await User.find({
			"subscription.plan": { $in: ["basic", "pro"] },
			"subscription.endDate": null,
		});

		for (const user of paidUsers) {
			user.subscription.endDate = new Date(
				Date.now() + 30 * 24 * 60 * 60 * 1000,
			);
			await user.save();
		}

		// Count results using countDocuments()
		const freeUsers = await User.countDocuments({
			subscription: { $exists: false },
		});
		const basicUsers = await User.countDocuments({
			"subscription.plan": "basic",
		});
		const proUsers = await User.countDocuments({ "subscription.plan": "pro" });

		res.json({
			success: true,
			message: "Database cleaned",
			removedFreeSubscriptions: result.modifiedCount,
			stats: {
				free: freeUsers,
				basic: basicUsers,
				pro: proUsers,
			},
		});
	} catch (err) {
		console.error("Clean database error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// GET SUBSCRIPTION
// ===============================
export const getSubscription = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select("subscription");

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// No subscription = free user
		if (!user.subscription || !user.subscription.plan) {
			return res.status(200).json({
				success: true,
				data: {
					plan: "free",
					status: "active",
				},
			});
		}

		// Check if subscription expired
		const now = new Date();
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
// SYNC SUBSCRIPTION
// ===============================
export const syncSubscription = async (req, res) => {
	try {
		const {
			plan,
			productId,
			revenueCatId,
			startDate,
			endDate,
			originalTransactionId, // Add this - RevenueCat provides this
			appUserId, // Add this - should match the authenticated user's ID
		} = req.body;

		if (!plan) {
			return res.status(400).json({
				success: false,
				error: "Plan is required",
			});
		}

		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// CRITICAL: Verify that the subscription belongs to THIS user
		// Method 1: Check if appUserId matches the authenticated user
		if (appUserId && appUserId !== req.user._id.toString()) {
			console.error(
				`Subscription ownership mismatch: ${appUserId} vs ${req.user._id}`,
			);
			return res.status(403).json({
				success: false,
				error: "Subscription does not belong to this user",
			});
		}

		// Method 2: Store which user originally purchased the subscription
		// You should store this mapping in a separate Subscriptions collection

		// Free plan - remove subscription entirely
		if (plan === "free") {
			user.subscription = undefined;
			await user.save();

			return res.status(200).json({
				success: true,
				message: "User is on free plan",
				data: { plan: "free", status: "active" },
			});
		}

		// For paid plans, verify the subscription is valid and belongs to this user
		// Check if this subscription was already assigned to a different user
		const existingSubscriptionUser = await User.findOne({
			"subscription.revenueCatId": revenueCatId,
			_id: { $ne: user._id },
		});

		if (existingSubscriptionUser) {
			console.error(
				`Subscription ${revenueCatId} already belongs to user ${existingSubscriptionUser._id}`,
			);
			return res.status(403).json({
				success: false,
				error: "This subscription is already associated with another account",
				requiresLogout: true, // Signal client to clear cached subscription data
			});
		}

		// Store the authenticated user's ID as the owner
		user.subscription = {
			plan,
			status: "active",
			startDate: startDate ? new Date(startDate) : new Date(),
			endDate: endDate
				? new Date(endDate)
				: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			productId: productId || null,
			revenueCatId: revenueCatId || null, // Don't default to user ID
			originalTransactionId: originalTransactionId || null, // Store for verification
			userId: req.user._id, // Explicitly store which user owns this
		};

		await user.save();

		return res.status(200).json({
			success: true,
			message: "Subscription synced",
			data: user.subscription,
		});
	} catch (err) {
		console.error("Sync Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};
