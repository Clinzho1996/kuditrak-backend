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
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
