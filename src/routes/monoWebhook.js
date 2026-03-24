import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;

		console.log("📥 PAYLOAD:", payload);

		// ✅ Always respond immediately
		res.status(200).json({ success: true });

		// =========================
		// ✅ CASE 1: ACCOUNT CONNECTED
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			const user = await User.findOne({ monoCustomerId: customerId });

			if (!user) {
				console.log("❌ User not found:", customerId);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId }, // ✅ unique key
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Active",
					lastSync: new Date(),
				},
				{
					upsert: true,
					new: true,
					setDefaultsOnInsert: true,
				},
			);

			console.log("✅ account_connected saved:", accountId);
		}

		// =========================
		// ✅ CASE 2: ACCOUNT UPDATED (MAIN EVENT)
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;

			// 🔥 IMPORTANT: find user properly
			let user = null;

			// Try to get from existing connection first
			const existingConnection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			if (existingConnection?.monoCustomerId) {
				user = await User.findOne({
					monoCustomerId: existingConnection.monoCustomerId,
				});
			}

			// fallback (not ideal but safe for now)
			if (!user) {
				user = await User.findOne({
					monoCustomerId: { $exists: true },
				});
			}

			if (!user) {
				console.log("❌ No user found for account:", account._id);
				return;
			}

			const connection = await BankConnection.findOneAndUpdate(
				{ monoAccountId: account._id }, // ✅ SINGLE SOURCE OF TRUTH
				{
					userId: user._id,
					monoCustomerId: user.monoCustomerId,

					// account details
					accountName: account.name,
					accountNumber: account.accountNumber,
					bankName: account.institution?.name,

					// optional fields
					balance: account.balance,
					currency: account.currency,

					status: "Active",
					lastSync: new Date(),
				},
				{
					upsert: true,
					new: true,
					setDefaultsOnInsert: true,
				},
			);

			console.log("✅ account_updated upserted:", connection._id);
		}
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
