// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";

const router = express.Router();

// Helper function to safely create/update connection with retry logic
async function safeUpsertConnection(accountId, updateData) {
	try {
		// Try to find and update existing connection first
		const connection = await BankConnection.findOneAndUpdate(
			{ monoAccountId: accountId },
			{ $set: updateData },
			{
				new: true,
				upsert: false, // Don't upsert here, we'll handle creation separately
				runValidators: true,
			},
		);

		if (connection) {
			return connection;
		}

		// If not found, try to create with unique index handling
		try {
			const newConnection = await BankConnection.create({
				monoAccountId: accountId,
				...updateData,
			});
			return newConnection;
		} catch (createError) {
			// If duplicate key error, fetch the existing record
			if (createError.code === 11000) {
				const existingConnection = await BankConnection.findOne({
					monoAccountId: accountId,
				});
				if (existingConnection) {
					// Update the existing record instead
					await BankConnection.updateOne(
						{ monoAccountId: accountId },
						{ $set: updateData },
					);
					return await BankConnection.findOne({ monoAccountId: accountId });
				}
			}
			throw createError;
		}
	} catch (error) {
		console.error("Error in safeUpsertConnection:", error);
		throw error;
	}
}

router.post("/webhook", async (req, res) => {
	try {
		const webhookPayload = req.body;
		const eventType = webhookPayload?.event;
		const payload = webhookPayload?.data;

		console.log("📌 Event Type:", eventType);
		console.log("📥 PAYLOAD:", JSON.stringify(payload, null, 2));

		// Respond immediately to acknowledge receipt
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
				console.log("❌ User not found for monoCustomerId:", customerId);
				return;
			}

			// Check if this account is already linked
			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			if (connection) {
				console.log("⚠️ Account already exists, updating status:", accountId);
				await safeUpsertConnection(accountId, {
					status: "Active",
					lastSync: new Date(),
					userId: user._id,
					monoCustomerId: customerId,
				});
			} else {
				// Create new connection with minimal info first
				connection = await BankConnection.create({
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Processing",
					lastSync: new Date(),
					provider: "mono",
				});
				console.log("✅ New connection created for account:", accountId);
			}

			console.log("   User ID:", user._id);
			console.log("   User Email:", user.email);
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

			// Add a small delay to prevent race conditions
			await new Promise((resolve) => setTimeout(resolve, 100));

			try {
				// Fetch full account details from Mono API to get all data
				const monoResponse = await mono.get(`/accounts/${accountId}`);
				const fullAccount = monoResponse.data.data;
				const customerId = fullAccount.customer?.id;

				if (!customerId) {
					console.log("❌ Could not retrieve customer ID from Mono API");
					return;
				}

				// Find the user
				const user = await User.findOne({ monoCustomerId: customerId });
				if (!user) {
					console.log("❌ No user found with monoCustomerId:", customerId);
					return;
				}

				// Prepare update data with ALL account details
				const updateData = {
					userId: user._id,
					monoCustomerId: customerId,
					accountName: accountData.name || fullAccount.name,
					accountNumber:
						accountData.accountNumber || fullAccount.account_number,
					bankName:
						accountData.institution?.name || fullAccount.institution?.name,
					balance: accountData.balance ?? fullAccount.balance,
					currency: accountData.currency || fullAccount.currency,
					bvn: accountData.bvn || fullAccount.bvn,
					status: "Active",
					lastSync: new Date(),
					provider: "mono",
				};

				// Use safe upsert to handle race conditions
				const connection = await safeUpsertConnection(accountId, updateData);

				console.log("✅ Account updated successfully:");
				console.log("   Account ID:", accountId);
				console.log("   Account Name:", connection.accountName);
				console.log("   Account Number:", connection.accountNumber);
				console.log("   Bank:", connection.bankName);
				console.log("   Balance:", connection.balance);
			} catch (error) {
				console.error("❌ Error processing account_updated:", error);
			}
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

			// Add a small delay to prevent race conditions
			await new Promise((resolve) => setTimeout(resolve, 100));

			try {
				// First check if connection exists
				let connection = await BankConnection.findOne({
					monoAccountId: accountId,
				});

				if (!connection) {
					console.log(
						"⚠️ Connection not found for reauthorization:",
						accountId,
					);
					console.log(
						"   Attempting to recover by fetching account details...",
					);

					// Fetch full account details from Mono API
					const monoResponse = await mono.get(`/accounts/${accountId}`);
					const fullAccount = monoResponse.data.data;
					const customerId = fullAccount.customer?.id;

					if (customerId) {
						const user = await User.findOne({ monoCustomerId: customerId });

						if (user) {
							const updateData = {
								userId: user._id,
								monoCustomerId: customerId,
								accountName: fullAccount.name,
								accountNumber: fullAccount.account_number,
								bankName: fullAccount.institution?.name,
								balance: fullAccount.balance,
								currency: fullAccount.currency,
								bvn: fullAccount.bvn,
								status: "Active",
								lastSync: new Date(),
								provider: "mono",
							};

							connection = await safeUpsertConnection(accountId, updateData);
							console.log(
								"✅ Recovered connection during reauthorization:",
								accountId,
							);
							console.log("   User ID:", user._id);
						} else {
							console.log("❌ No user found for reauthorization recovery");
							return;
						}
					}
				} else {
					// Update existing connection
					connection.status = "Active";
					connection.lastSync = new Date();
					await connection.save();
					console.log("✅ Account reauthorized and updated:", accountId);
				}
			} catch (error) {
				console.error("❌ Error processing reauthorization:", error);
			}
			return;
		}

		console.log("⚠️ Unknown event type:", eventType);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
