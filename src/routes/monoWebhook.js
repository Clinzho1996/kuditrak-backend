import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const webhookPayload = req.body;
		const eventType = webhookPayload?.event;
		const payload = webhookPayload?.data;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", JSON.stringify(payload, null, 2));
		console.log("raw payload", JSON.stringify(webhookPayload, null, 2));

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
				console.log("⚠️ No account data in payload");
				return;
			}

			const accountId = accountData._id;

			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			// If connection doesn't exist, try to create it
			if (!connection) {
				console.log("⚠️ Bank connection not found, attempting to create...");

				// Try to find user by monoCustomerId from the payload or from the account
				let userId = null;

				// Check if we have customer info in meta or elsewhere
				if (payload.meta?.customer_id) {
					const user = await User.findOne({
						monoCustomerId: payload.meta.customer_id,
					});
					if (user) userId = user._id;
				}

				// If still no user, we need to wait for the account_connected webhook
				if (!userId) {
					console.log(
						"❌ Cannot create connection: No user found for account",
						accountId,
					);
					console.log(
						"   This account will be processed when account_connected webhook arrives",
					);
					return;
				}

				// Create new connection
				connection = new BankConnection({
					userId: userId,
					monoAccountId: accountId,
					monoCustomerId: payload.meta?.customer_id || null,
					accountName: accountData.name,
					accountNumber: accountData.accountNumber,
					bankName: accountData.institution?.name,
					balance: accountData.balance,
					currency: accountData.currency,
					bvn: accountData.bvn,
					status: "Active",
					lastSync: new Date(),
				});

				await connection.save();
				console.log("✅ Created new bank connection for account:", accountId);
			} else {
				// Update existing connection
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
				console.log("✅ Updated bank connection for account:", accountId);
			}

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
				console.log("⚠️ No account data in payload");
				return;
			}

			const accountId = accountData._id;

			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			if (!connection) {
				console.log(
					"⚠️ Cannot update reauthorized: bank connection not found for account",
					accountId,
				);
				console.log(
					"   This might be a new account that hasn't been processed yet",
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
	}
});

export default router;
