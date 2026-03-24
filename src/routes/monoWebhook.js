// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		// ✅ Normalize payload (THIS IS THE KEY FIX)
		const eventType = req.body.type || req.body.data?.event;
		const payload = req.body.data?.data || req.body.data;

		console.log("EVENT:", eventType);
		console.log("PAYLOAD:", payload);

		// Always respond fast
		res.status(200).json({ success: true, message: "Webhook received" });

		// =========================
		// ✅ ACCOUNT LINKED (your curl + some Mono cases)
		// =========================
		if (eventType === "ACCOUNT_LINKED") {
			const account = payload.account;
			const customerId = payload.customer?.id;

			if (!account || !customerId) return;

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("User not found:", customerId);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: account.id },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: account.id,
					accountName: account.name,
					accountNumber: account.account_number,
					bankName: account.institution?.name,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true },
			);

			console.log("✅ ACCOUNT_LINKED saved:", account.id);
		}

		// =========================
		// ✅ ACCOUNT CONNECTED (LIVE - FIRST EVENT)
		// =========================
		if (eventType === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

			if (!accountId || !customerId) return;

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
		// ✅ ACCOUNT UPDATED (LIVE - FULL DATA)
		// =========================
		if (eventType === "mono.events.account_updated") {
			const account = payload.account;
			if (!account) return;

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
