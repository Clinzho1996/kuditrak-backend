// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;

		console.log("📥 PAYLOAD:", payload);

		// Respond immediately to Mono
		res.status(200).json({ success: true, message: "Webhook received" });

		// =========================
		// CASE 1: account_connected
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			// Save Mono Customer ID to user
			let user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("User not found with customerId, trying fallback...");
				// fallback: find user who started this linking (optional)
				// could store a temporary linkRef in user profile
				return console.log(
					`❌ Cannot save customerId, no user found for customer: ${customerId}`,
				);
			}

			// Save Mono Customer ID if not already
			if (!user.monoCustomerId) {
				user.monoCustomerId = customerId;
				await user.save();
				console.log("✅ Mono customerId saved to user:", user._id);
			}

			// Upsert BankConnection
			await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true },
			);

			console.log("✅ account_connected saved:", accountId);
			return;
		}

		// =========================
		// CASE 2: account_updated
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;
			const accountId = account._id;

			// Find existing connection
			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			// If no connection exists → create only if user exists
			let user = null;
			if (!connection) {
				if (payload?.customer) {
					user = await User.findOne({ monoCustomerId: payload.customer });
				}
				if (!user && account?.customerId) {
					user = await User.findOne({ monoCustomerId: account.customerId });
				}
				if (!user) {
					console.log(
						`❌ Cannot create connection: user not found for account ${accountId}`,
					);
					return;
				}

				connection = new BankConnection({
					userId: user._id,
					monoCustomerId: user.monoCustomerId,
					monoAccountId: accountId,
				});
				console.log("⚡ Creating missing connection:", accountId);
			}

			// Update connection
			connection.accountName = account.name;
			connection.accountNumber = account.accountNumber;
			connection.bankName = account.institution?.name || "Unknown";
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();

			console.log("✅ account_updated saved:", accountId);
			return;
		}

		console.log("⚠️ Unknown payload:", payload);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
