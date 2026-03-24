// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;
		console.log("📥 PAYLOAD:", payload);

		// Respond immediately
		res.status(200).json({ success: true, message: "Webhook received" });

		// =========================
		// CASE 1: account_connected → save monoCustomerId + create connection
		// =========================
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			// Find the user via the customer ref/session (or via meta.userId if you send it)
			let user;
			if (payload.meta?.userId) {
				user = await User.findById(payload.meta.userId);
			} else {
				user = await User.findOne({ monoCustomerId: customerId });
			}

			if (!user) {
				console.log(
					"❌ Cannot create connection: user not found for account",
					accountId,
				);
				return;
			}

			// Save Mono customerId to user if not already
			if (!user.monoCustomerId) {
				user.monoCustomerId = customerId;
				await user.save();
				console.log("✅ Saved monoCustomerId to user:", user._id);
			}

			// Upsert BankConnection
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
		// CASE 2: account_updated → update existing connection only
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

			// Find user to ensure monoCustomerId is present
			const user = await User.findById(connection.userId);
			if (!user || !user.monoCustomerId) {
				console.log(
					"❌ Cannot update: user not found or customerId missing for account",
					account._id,
				);
				return;
			}

			// Update connection details
			connection.accountName = account.name;
			connection.accountNumber = account.accountNumber;
			connection.bankName = account.institution?.name;
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.lastSync = new Date();
			connection.status = "Active";

			await connection.save();
			console.log("✅ account_updated saved:", account._id);
			return;
		}

		// =========================
		// Other payloads (jobs.*, etc.) → just log
		// =========================
		console.log("⚠️ Unknown payload:", payload);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
