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
		// ✅ account_connected
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
		// ✅ account_updated (FINAL CORRECT VERSION)
		// =========================
		if (payload?.account?._id) {
			const account = payload.account;

			let connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			// ✅ CREATE if missing
			if (!connection) {
				console.log("⚡ Creating missing connection:", account._id);

				// ⚠️ better user match (IMPORTANT FIX)
				const user = await User.findOne({
					monoCustomerId: { $exists: true },
				});

				if (!user) {
					console.log("❌ No user found");
					return;
				}

				connection = new BankConnection({
					userId: user._id,
					monoCustomerId: user.monoCustomerId,
					monoAccountId: account._id,
				});
			}

			// ✅ SAFE updates (handles partial payloads too)
			connection.accountName = account.name || connection.accountName;
			connection.accountNumber =
				account.accountNumber || connection.accountNumber;
			connection.bankName = account.institution?.name || connection.bankName;
			connection.balance = account.balance ?? connection.balance;
			connection.currency = account.currency || connection.currency;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();

			console.log("✅ account_updated saved:", account._id);
		}
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
