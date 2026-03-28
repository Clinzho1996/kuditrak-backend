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
		const { plan, productId, revenueCatId, startDate, endDate } = req.body;

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

		// Paid plan - create/update subscription
		user.subscription = {
			plan,
			status: "active",
			startDate: startDate ? new Date(startDate) : new Date(),
			endDate: endDate
				? new Date(endDate)
				: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			productId: productId || null,
			revenueCatId: revenueCatId || user._id.toString(),
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
