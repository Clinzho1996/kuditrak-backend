// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;
		console.log("📥 PAYLOAD:", payload);

		// respond immediately to Mono
		res.status(200).json({ success: true });

		// =========================
		// CASE 1: account_connected → create a new connection if user exists
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("❌ User not found for customerId:", customerId);
				return;
			}

			const connection = await BankConnection.findOneAndUpdate(
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
		// CASE 2: account_updated → update only existing connection
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;

			// find existing connection
			const connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			if (!connection) {
				console.log(
					"❌ Cannot update: user not found or customerId missing for account",
					account._id,
				);
				return; // do NOT create a connection without a linked user
			}

			// update connection details
			connection.accountName = account.name;
			connection.accountNumber = account.accountNumber;
			connection.bankName = account.institution?.name || "Unknown";
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();

			console.log("✅ account_updated saved:", account._id);
			return;
		}

		// =========================
		// Unknown event
		// =========================
		console.log("⚠️ Unhandled Mono event type:", req.body.data?.event);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
