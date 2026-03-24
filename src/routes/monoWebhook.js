import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const rawPayload = req.body;

		// Normalize event and payload
		const eventType = rawPayload.event || rawPayload.data?.event;
		const payload =
			rawPayload.data?.data || rawPayload.data?.account || rawPayload;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", payload);

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
			const accountData = payload.account || payload; // full account object
			if (!accountData || !accountData._id) {
				console.log("⚠️ No account data in payload:", payload);
				return;
			}

			const accountId = accountData._id;

			const user = await User.findOne({
				monoCustomerId: payload.customerId || payload.customer,
			});
			if (!user) {
				console.log("❌ Cannot update: user not found for account", accountId);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: user.monoCustomerId,
					monoAccountId: accountId,
					accountName: accountData.name,
					accountNumber: accountData.accountNumber,
					bankName: accountData.institution?.name,
					currency: accountData.currency,
					balance: accountData.balance,
					bvn: accountData.bvn,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, returnDocument: "after" },
			);

			console.log("✅ account_updated saved:", accountId);
			return;
		}

		// ---------- ACCOUNT REAUTHORIZED ----------
		if (eventType === "mono.events.account_reauthorized") {
			const accountId = payload._id;
			const connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});
			if (!connection) {
				console.log(
					"❌ Cannot reauthorize: bank connection not found",
					accountId,
				);
				return;
			}
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
