import User from "../models/User.js";
import {
	initializeSubscriptionPayment,
	verifySubscriptionPayment,
} from "../services/paymentGateway.js";

// ===============================
// GET CURRENT SUBSCRIPTION
// ===============================
export const getSubscription = async (req, res) => {
	try {
		const userId = req.user._id; // FIXED

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
// UPGRADE SUBSCRIPTION
// ===============================
export const upgradeSubscription = async (req, res) => {
	try {
		const userId = req.user._id; // from auth middleware
		const { plan } = req.body;

		if (!plan) {
			return res.status(400).json({ error: "Plan is required" });
		}

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Prevent duplicate active subscription upgrade
		if (
			user.subscription?.status === "active" &&
			user.subscription?.endDate > new Date()
		) {
			return res.status(400).json({
				error: "You already have an active subscription",
			});
		}

		const payment = await initializeSubscriptionPayment({
			email: user.email,
			plan,
			userId,
		});

		return res.status(200).json({
			success: true,
			message: "Payment initialized",
			data: payment,
		});
	} catch (err) {
		console.error("Upgrade Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};

// ===============================
// VERIFY SUBSCRIPTION PAYMENT
// ===============================
export const verifySubscription = async (req, res) => {
	try {
		const { reference } = req.query;

		if (!reference) {
			return res.status(400).json({ error: "Reference is required" });
		}

		const result = await verifySubscriptionPayment(reference);

		if (!result.success) {
			return res.status(400).json({
				error: "Payment verification failed",
			});
		}

		const user = await User.findById(result.userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Prevent double processing (VERY IMPORTANT)
		if (
			user.subscription?.status === "active" &&
			user.subscription?.endDate > new Date()
		) {
			return res.status(200).json({
				success: true,
				message: "Subscription already active",
				plan: user.subscription.plan,
			});
		}

		// Assign subscription
		const now = new Date();
		const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		user.subscription = {
			plan: result.plan,
			startDate: now,
			endDate: expiry,
			status: "active",
		};

		await user.save();

		return res.status(200).json({
			success: true,
			message: "Subscription activated successfully",
			data: {
				plan: result.plan,
				startDate: now,
				endDate: expiry,
			},
		});
	} catch (err) {
		console.error("Verify Subscription Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};
