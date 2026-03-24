// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;

		console.log("PAYLOAD:", payload);

		// respond immediately
		res.status(200).json({ success: true });

		// =========================
		// ✅ CASE 1: account_connected
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("User not found:", customerId);
				return;
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
		}

		// =========================
		// ✅ CASE 2: account_updated
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;

			const connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			if (!connection) {
				console.log("⚠️ No connection found for:", account._id);
				return;
			}

			connection.accountName = account.name;
			connection.accountNumber = account.accountNumber;
			connection.bankName = account.institution?.name;
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.lastSync = new Date();

			await connection.save();

			console.log("✅ account_updated saved:", account._id);
		}

		// =========================
		// ✅ account_updated (CREATE OR UPDATE)
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;

			// Try to find existing connection
			let connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			// 🚨 If NOT found → CREATE IT (this is your missing piece)
			if (!connection) {
				console.log("⚡ Creating missing connection from account_updated");

				// We don’t have customerId here, so fallback:
				// find user by ANY existing monoCustomerId (or skip if not found)
				const user = await User.findOne({ monoCustomerId: { $exists: true } });

				if (!user) {
					console.log("❌ No user found to attach account");
					return;
				}

				connection = new BankConnection({
					userId: user._id,
					monoCustomerId: user.monoCustomerId,
					monoAccountId: account._id,
				});
			}

			// Update full details
			connection.accountName = account.name;
			connection.accountNumber = account.accountNumber;
			connection.bankName = account.institution?.name;
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();

			console.log("✅ account_updated saved (upsert):", account._id);
		}
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
