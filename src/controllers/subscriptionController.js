// backend/controllers/subscriptionController.js
import crypto from "crypto";
import User from "../models/User.js";

// ===============================
// REVENUECAT WEBHOOK HANDLER
// ===============================
export const handleRevenueCatWebhook = async (req, res) => {
	try {
		const event = req.body;

		// Verify webhook signature (optional but recommended)
		const signature = req.headers["x-revenuecat-signature"];
		if (process.env.REVENUECAT_WEBHOOK_SECRET && signature) {
			const expectedSignature = crypto
				.createHmac("sha256", process.env.REVENUECAT_WEBHOOK_SECRET)
				.update(JSON.stringify(event))
				.digest("hex");

			if (signature !== expectedSignature) {
				console.error("Invalid webhook signature");
				return res.status(401).json({ error: "Invalid signature" });
			}
		}

		console.log("Received RevenueCat webhook event:", event.type);

		const {
			event: eventType,
			api_version,
			app_user_id,
			original_app_user_id,
			product_id,
			expiration_at_ms,
			purchase_date_ms,
			entitlement_id,
		} = event;

		// Find user by RevenueCat ID or our user ID
		let user = await User.findOne({
			$or: [
				{ revenueCatId: app_user_id },
				{ revenueCatId: original_app_user_id },
				{ _id: app_user_id },
			],
		});

		if (!user) {
			console.log("User not found for webhook:", app_user_id);
			return res.status(404).json({ error: "User not found" });
		}

		// Handle different event types
		switch (eventType) {
			case "INITIAL_PURCHASE":
			case "RENEWAL":
				// Handle new purchase or renewal
				await updateUserSubscriptionFromWebhook(user, event);
				break;

			case "CANCELLATION":
				// Handle subscription cancellation
				if (user.subscription) {
					user.subscription.status = "cancelled";
					await user.save();
					console.log(`Subscription cancelled for user ${user._id}`);
				}
				break;

			case "EXPIRATION":
				// Handle subscription expiration
				if (user.subscription) {
					user.subscription.status = "expired";
					await user.save();
					console.log(`Subscription expired for user ${user._id}`);
				}
				break;

			case "NON_RENEWING_PURCHASE":
				// Handle one-time purchases (if applicable)
				console.log("Non-renewing purchase detected:", product_id);
				break;

			case "TRANSFER":
				// Handle subscription transfer between users
				console.log("Subscription transfer detected");
				break;

			default:
				console.log("Unhandled webhook event type:", eventType);
		}

		res.status(200).json({ success: true });
	} catch (err) {
		console.error("RevenueCat webhook error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Helper function to update user subscription from webhook
const updateUserSubscriptionFromWebhook = async (user, event) => {
	const {
		entitlements,
		product_id,
		expiration_at_ms,
		purchase_date_ms,
		store,
	} = event;

	// Check if Kuditrak Pro entitlement is active
	const proEntitlement = entitlements?.Kuditrak_Pro;
	const isActive =
		proEntitlement && proEntitlement.expires_date_ms > Date.now();

	let plan = "free";

	if (isActive) {
		// Determine plan based on product ID
		if (product_id === "monthly") {
			plan = "basic";
		} else if (product_id === "three_month" || product_id === "yearly") {
			plan = "pro";
		}
	}

	const subscriptionData = {
		plan,
		status: isActive ? "active" : "expired",
		startDate: purchase_date_ms ? new Date(purchase_date_ms) : new Date(),
		endDate: expiration_at_ms ? new Date(expiration_at_ms) : null,
		productId: product_id,
		store: store,
		revenueCatId: event.original_app_user_id,
		lastSyncAt: new Date(),
	};

	// Update user subscription
	user.subscription = subscriptionData;
	user.revenueCatId = event.original_app_user_id;

	await user.save();

	console.log(`Subscription updated for user ${user._id}:`, subscriptionData);
};

// ===============================
// SYNC SUBSCRIPTION FROM REVENUECAT (Manual sync)
// ===============================
export const syncSubscription = async (req, res) => {
	try {
		const { plan, productId, revenueCatId, startDate, endDate, transactionId } =
			req.body;
		const userId = req.user._id;

		console.log("Manually syncing subscription:", {
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
			productId: productId,
			transactionId: transactionId,
			revenueCatId: revenueCatId,
			lastSyncAt: new Date(),
		};

		user.revenueCatId = revenueCatId;

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
// GET CURRENT SUBSCRIPTION
// ===============================
export const getSubscription = async (req, res) => {
	try {
		const userId = req.user._id;

		const user = await User.findById(userId).select(
			"subscription revenueCatId",
		);

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
// VERIFY SUBSCRIPTION WITH REVENUECAT (Alternative to native receipt verification)
// ===============================
export const verifyWithRevenueCat = async (req, res) => {
	try {
		const { revenueCatId, productId, platform } = req.body;
		const userId = req.user._id;

		console.log("Verifying subscription with RevenueCat:", {
			revenueCatId,
			productId,
		});

		// Call RevenueCat API to get customer info
		const response = await fetch(
			`https://api.revenuecat.com/v1/subscribers/${revenueCatId}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}`,
					"Content-Type": "application/json",
				},
			},
		);

		const data = await response.json();

		if (!response.ok) {
			console.error("RevenueCat API error:", data);
			return res
				.status(400)
				.json({ error: "Failed to verify with RevenueCat" });
		}

		const subscriber = data.subscriber;
		const entitlement = subscriber.entitlements["Kuditrak Pro"];
		const isActive = entitlement && entitlement.expires_date_ms > Date.now();

		let plan = "free";
		if (isActive) {
			const productIdentifier = entitlement.product_identifier;
			if (productIdentifier === "monthly") {
				plan = "basic";
			} else if (
				productIdentifier === "three_month" ||
				productIdentifier === "yearly"
			) {
				plan = "pro";
			}
		}

		// Update user in database
		const user = await User.findById(userId);

		if (user) {
			user.subscription = {
				plan: plan,
				status: isActive ? "active" : "expired",
				startDate: entitlement?.purchase_date_ms
					? new Date(entitlement.purchase_date_ms)
					: new Date(),
				endDate: entitlement?.expires_date_ms
					? new Date(entitlement.expires_date_ms)
					: null,
				productId: entitlement?.product_identifier,
				revenueCatId: revenueCatId,
				lastSyncAt: new Date(),
			};
			user.revenueCatId = revenueCatId;
			await user.save();
		}

		res.json({
			success: true,
			data: {
				plan,
				status: isActive ? "active" : "expired",
				startDate: entitlement?.purchase_date_ms,
				endDate: entitlement?.expires_date_ms,
				originalPurchaseDate: subscriber.original_purchase_date_ms,
				firstSeen: subscriber.first_seen,
			},
		});
	} catch (err) {
		console.error("Verify with RevenueCat error:", err);
		res.status(500).json({ error: err.message });
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

		// Note: Actual cancellation should be done through RevenueCat SDK on the client
		// This just updates the local status
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
// GET SUBSCRIPTION STATUS (With RevenueCat sync)
// ===============================
export const getSubscriptionStatus = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select(
			"subscription revenueCatId",
		);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// If user has a RevenueCat ID, sync with RevenueCat for latest status
		if (user.revenueCatId) {
			try {
				const response = await fetch(
					`https://api.revenuecat.com/v1/subscribers/${user.revenueCatId}`,
					{
						headers: {
							Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}`,
							"Content-Type": "application/json",
						},
					},
				);

				if (response.ok) {
					const data = await response.json();
					const entitlement = data.subscriber.entitlements["Kuditrak Pro"];
					const isActive =
						entitlement && entitlement.expires_date_ms > Date.now();

					let plan = "free";
					if (isActive) {
						const productIdentifier = entitlement.product_identifier;
						if (productIdentifier === "monthly") {
							plan = "basic";
						} else if (
							productIdentifier === "three_month" ||
							productIdentifier === "yearly"
						) {
							plan = "pro";
						}
					}

					// Update local subscription data
					user.subscription = {
						plan: plan,
						status: isActive ? "active" : "expired",
						startDate: entitlement?.purchase_date_ms
							? new Date(entitlement.purchase_date_ms)
							: user.subscription?.startDate,
						endDate: entitlement?.expires_date_ms
							? new Date(entitlement.expires_date_ms)
							: null,
						productId: entitlement?.product_identifier,
						revenueCatId: user.revenueCatId,
						lastSyncAt: new Date(),
					};
					await user.save();
				}
			} catch (syncError) {
				console.error("Failed to sync with RevenueCat:", syncError);
				// Continue with local data if sync fails
			}
		}

		let subscription = user.subscription || {
			plan: "free",
			status: "active",
			startDate: null,
			endDate: null,
		};

		const now = new Date();

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

// ===============================
// GET USER'S SUBSCRIPTION HISTORY
// ===============================
export const getSubscriptionHistory = async (req, res) => {
	try {
		const user = await User.findById(req.user._id)
			.select("subscriptionHistory subscription revenueCatId")
			.populate("subscriptionHistory");

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		return res.status(200).json({
			success: true,
			data: {
				current: user.subscription,
				history: user.subscriptionHistory || [],
			},
		});
	} catch (err) {
		console.error("Get Subscription History Error:", err.message);
		return res.status(500).json({ error: err.message });
	}
};
