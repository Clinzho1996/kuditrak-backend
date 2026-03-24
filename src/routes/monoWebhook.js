import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;
		console.log("📥 PAYLOAD:", payload);

		res.status(200).json({ success: true, message: "Webhook received" });

		// =========================
		// CASE 1: account_connected (customer exists)
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				return console.log(
					`❌ Cannot save customerId, no user found for customer: ${customerId}`,
				);
			}

			// Save Mono Customer ID if missing
			if (!user.monoCustomerId) {
				user.monoCustomerId = customerId;
				await user.save();
				console.log("✅ Mono customerId saved to user:", user._id);
			}

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

			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});
			if (!connection) {
				// Cannot create new connection without user info
				return console.log(
					`❌ Cannot create connection: user not found for account ${accountId}`,
				);
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

		// =========================
		// CASE 3: Job events (sync_balance / sync_statement)
		// =========================
		if (payload?.name?.startsWith("jobs.accounts.")) {
			console.log(`⚠️ Job event: ${payload.name} - status: ${payload.status}`);
			return;
		}

		console.log("⚠️ Unknown payload:", payload);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
