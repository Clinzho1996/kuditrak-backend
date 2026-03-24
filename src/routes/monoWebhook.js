import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		// Mono sends webhook with event wrapper
		const webhookData = req.body;

		// The actual event is in webhookData.data
		const eventType = webhookData?.data?.event;
		const payload = webhookData?.data?.data;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", JSON.stringify(payload, null, 2));
		console.log("raw payload", JSON.stringify(webhookData, null, 2));

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

			// For reauthorization, we might want to fetch fresh account data
			// since the webhook doesn't contain full account details
			try {
				// Fetch updated account details from Mono API
				const monoResponse = await mono.get(`/accounts/${accountId}`);
				const freshAccountData = monoResponse.data.data;

				connection.accountName =
					freshAccountData.name || connection.accountName;
				connection.accountNumber =
					freshAccountData.account_number || connection.accountNumber;
				connection.bankName =
					freshAccountData.institution?.name || connection.bankName;
				connection.balance = freshAccountData.balance ?? connection.balance;
				connection.currency = freshAccountData.currency || connection.currency;
				connection.bvn = freshAccountData.bvn || connection.bvn;
			} catch (fetchError) {
				console.log(
					"⚠️ Could not fetch fresh account data:",
					fetchError.message,
				);
				// Continue without fresh data
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
		// Don't throw error here, just log it
	}
});

export default router;
