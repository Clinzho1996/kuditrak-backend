// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const rawPayload = req.body.data || req.body;
		const eventType = rawPayload.event || rawPayload.type;

		// Mono wraps the real payload under data.data sometimes
		const payload = rawPayload.data?.data || rawPayload.data || rawPayload;

		console.log("📥 PAYLOAD:", payload);

		// respond immediately to Mono
		res.status(200).json({ success: true });

		// ---------- ACCOUNT CONNECTED ----------
		if (eventType === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

			// Find user by saved monoCustomerId
			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log(
					"❌ Cannot create placeholder connection: user not found for account",
					accountId,
				);
				return;
			}

			// Upsert placeholder connection
			await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Processing", // placeholder until updated
					lastSync: new Date(),
				},
				{ upsert: true, returnDocument: "after" },
			);

			console.log("✅ Placeholder account connection saved:", accountId);
			return;
		}

		// ---------- ACCOUNT UPDATED ----------
		if (eventType === "mono.events.account_updated") {
			const accountData = payload.account;
			if (!accountData || !accountData._id) {
				console.log("⚠️ No account data in payload:", payload);
				return;
			}

			const accountId = accountData._id;

			const connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});
			if (!connection) {
				console.log(
					"❌ Cannot update: bank connection not found for account",
					accountId,
				);
				return;
			}

			// Update connection with full details
			connection.accountName = accountData.name || connection.accountName;
			connection.accountNumber =
				accountData.accountNumber || connection.accountNumber;
			connection.bankName =
				accountData.institution?.name || connection.bankName;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();
			console.log("✅ account_updated saved:", accountId);
			return;
		}

		console.log("⚠️ Unknown event type:", eventType);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
