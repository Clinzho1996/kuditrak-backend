import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const webhookPayload = req.body;

		// The event type is at the root level
		const eventType = webhookPayload?.event;
		const payload = webhookPayload?.data;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", JSON.stringify(payload, null, 2));
		console.log("raw payload", JSON.stringify(webhookPayload, null, 2));

		// Respond immediately
		res.status(200).json({ success: true });

		if (!eventType || !payload) {
			console.log("⚠️ Invalid payload or missing event type");
			console.log("eventType:", eventType);
			console.log("payload:", payload);
			return;
		}

		// ---------- ACCOUNT CONNECTED ----------
		if (eventType === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

			console.log("🔄 Processing account_connected for account:", accountId);

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log(
					"❌ Cannot create placeholder connection: user not found for account",
					accountId,
				);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Processing",
					lastSync: new Date(),
				},
				{ upsert: true, returnDocument: "after" },
			);

			console.log("✅ Placeholder account connection saved:", accountId);
			return;
		}

		// ---------- ACCOUNT UPDATED ----------
		if (eventType === "mono.events.account_updated") {
			console.log("🔄 Processing account_updated event");

			const accountData = payload.account || payload;
			if (!accountData || !accountData._id) {
				console.log(
					"⚠️ No account data in payload:",
					JSON.stringify(payload, null, 2),
				);
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

			// Update with full account data from webhook
			connection.accountName = accountData.name || connection.accountName;
			connection.accountNumber =
				accountData.accountNumber || connection.accountNumber;
			connection.bankName =
				accountData.institution?.name || connection.bankName;
			connection.balance = accountData.balance ?? connection.balance;
			connection.currency = accountData.currency || connection.currency;
			connection.bvn = accountData.bvn || connection.bvn;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();
			console.log("✅ account_updated saved for account:", accountId);
			console.log("   Account Name:", connection.accountName);
			console.log("   Account Number:", connection.accountNumber);
			console.log("   Bank:", connection.bankName);
			console.log("   Balance:", connection.balance);
			return;
		}

		// ---------- ACCOUNT REAUTHORIZED ----------
		if (eventType === "mono.events.account_reauthorized") {
			console.log("🔄 Processing reauthorization event");

			const accountData = payload.account || payload;
			if (!accountData || !accountData._id) {
				console.log(
					"⚠️ No account data in payload:",
					JSON.stringify(payload, null, 2),
				);
				return;
			}

			const accountId = accountData._id;

			const connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});
			if (!connection) {
				console.log(
					"❌ Cannot update reauthorized: bank connection not found for account",
					accountId,
				);
				return;
			}

			// Update status only for reauthorization
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();
			console.log("✅ account_reauthorized updated for account:", accountId);
			return;
		}

		console.log("⚠️ Unknown event type:", eventType);
	} catch (err) {
		console.error("❌ Webhook error:", err);
		// Don't throw error, just log it
	}
});

export default router;
