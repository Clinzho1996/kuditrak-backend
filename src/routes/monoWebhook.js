import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const rawPayload = req.body;

		// Mono wraps event inside data
		const eventType = rawPayload?.data?.event;
		const payload = rawPayload?.data?.data;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", payload);
		console.log("raw payload", rawPayload);

		// Respond immediately
		res.status(200).json({ success: true });

		if (!eventType || !payload) {
			console.log("⚠️ Invalid payload or missing event type");
			return;
		}

		// ---------- ACCOUNT CONNECTED ----------
		if (eventType === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

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
			const accountData = payload.account || payload;
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

			// Preserve existing monoCustomerId if not present in payload
			const monoCustomerId =
				connection.monoCustomerId || payload.customer || null;

			connection.accountName = accountData.name || connection.accountName;
			connection.accountNumber =
				accountData.accountNumber || connection.accountNumber;
			connection.bankName =
				accountData.institution?.name || connection.bankName;
			connection.balance = accountData.balance ?? connection.balance;
			connection.currency = accountData.currency || connection.currency;
			connection.bvn = accountData.bvn || connection.bvn;
			connection.monoCustomerId = monoCustomerId;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();
			console.log("✅ account_updated saved:", accountId);
			return;
		}

		// ---------- ACCOUNT REAUTHORIZED ----------
		if (eventType === "mono.events.account_reauthorized") {
			const accountData = payload.account || payload;
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
					"❌ Cannot update reauthorized: bank connection not found",
					accountId,
				);
				return;
			}

			// Preserve monoCustomerId
			connection.monoCustomerId =
				connection.monoCustomerId || payload.customer || null;
			connection.status = "Active";
			connection.lastSync = new Date();

			await connection.save();
			console.log("✅ account_reauthorized updated:", accountId);
			return;
		}

		console.log("⚠️ Unknown event type:", eventType);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
