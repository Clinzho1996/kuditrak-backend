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
		// inside webhook POST handler

		if (payload?.account?._id) {
			const account = payload.account;

			// Must find user by monoCustomerId first
			const connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});
			let user = null;

			if (connection?.monoCustomerId) {
				user = await User.findOne({
					monoCustomerId: connection.monoCustomerId,
				});
			} else if (payload?.customer) {
				user = await User.findOne({ monoCustomerId: payload.customer });
			}

			if (!user) {
				console.log(
					"❌ Cannot create connection: user not found for account",
					account._id,
				);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: account._id, monoCustomerId: user.monoCustomerId },
				{
					userId: user._id,
					monoCustomerId: user.monoCustomerId,
					monoAccountId: account._id,
					accountName: account.name,
					accountNumber: account.accountNumber,
					bankName: account.institution?.name || "Unknown",
					balance: account.balance,
					currency: account.currency,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			);

			console.log("✅ account_updated saved:", account._id);
		}
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
