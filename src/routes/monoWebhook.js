// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";

const router = express.Router();

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

		// In the account_connected handler, before creating
		if (eventType === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

			console.log("🔄 Processing account_connected for account:", accountId);

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("❌ User not found for monoCustomerId:", customerId);
				return;
			}

			// Check if this account is already linked (including placeholder records)
			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			if (connection) {
				console.log("⚠️ Account already exists, updating status:", accountId);
				connection.status = "Active";
				connection.lastSync = new Date();
				await connection.save();
			} else {
				// Create new connection - but only if it doesn't exist
				// Also check if there's a record with this accountId from a previous recovery
				const existingRecovery = await BankConnection.findOne({
					monoAccountId: accountId,
				});

				if (!existingRecovery) {
					connection = await BankConnection.create({
						userId: user._id,
						monoCustomerId: customerId,
						monoAccountId: accountId,
						status: "Active",
						lastSync: new Date(),
						provider: "mono",
					});
					console.log("✅ New connection created for account:", accountId);
				} else {
					console.log(
						"⚠️ Account already exists from recovery, skipping creation",
					);
				}
			}

			console.log("   User ID:", user._id);
			console.log("   User Email:", user.email);
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
				connection.status = "Active";
				connection.lastSync = new Date();
				await connection.save();
			} else {
				// Create new connection
				connection = await BankConnection.create({
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Active",
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

			// Try to find existing connection
			let connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			// If connection doesn't exist, try to create it
			if (!connection) {
				console.log("⚠️ Connection not found for account:", accountId);
				console.log("   Attempting to recover by fetching account details...");

				try {
					// Fetch full account details from Mono API to get customer ID
					const monoResponse = await mono.get(`/accounts/${accountId}`);
					const fullAccount = monoResponse.data.data;
					const customerId = fullAccount.customer?.id;

					if (customerId) {
						// Find the user by monoCustomerId
						const user = await User.findOne({ monoCustomerId: customerId });

						if (user) {
							// Create the missing connection
							connection = new BankConnection({
								userId: user._id,
								monoCustomerId: customerId,
								monoAccountId: accountId,
								accountName: accountData.name || fullAccount.name,
								accountNumber:
									accountData.accountNumber || fullAccount.account_number,
								bankName:
									accountData.institution?.name ||
									fullAccount.institution?.name,
								balance: accountData.balance ?? fullAccount.balance,
								currency: accountData.currency || fullAccount.currency,
								bvn: accountData.bvn || fullAccount.bvn,
								status: "Active",
								lastSync: new Date(),
								provider: "mono",
							});

							await connection.save();
							console.log(
								"✅ Successfully recovered and created connection for account:",
								accountId,
							);
							console.log("   User ID:", user._id);
							console.log("   Account Name:", connection.accountName);
						} else {
							console.log("❌ No user found with monoCustomerId:", customerId);
							return;
						}
					} else {
						console.log("❌ Could not retrieve customer ID from Mono API");
						return;
					}
				} catch (apiError) {
					console.error(
						"❌ Failed to fetch account from Mono API:",
						apiError.message,
					);
					console.log(
						"   This account will need to be linked again or manually added",
					);
					return;
				}
			}

			// Update the connection with full account details
			if (connection) {
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

				console.log("✅ Account updated successfully:");
				console.log("   Account ID:", accountId);
				console.log("   Account Name:", connection.accountName);
				console.log("   Account Number:", connection.accountNumber);
				console.log("   Bank:", connection.bankName);
				console.log("   Balance:", connection.balance);
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

			const connection = await BankConnection.findOne({
				monoAccountId: accountId,
			});

			if (!connection) {
				console.log("⚠️ Connection not found for reauthorization:", accountId);
				console.log("   Attempting to recover...");

				// Try to fetch account details to recover
				try {
					const monoResponse = await mono.get(`/accounts/${accountId}`);
					const fullAccount = monoResponse.data.data;
					const customerId = fullAccount.customer?.id;

					if (customerId) {
						const user = await User.findOne({ monoCustomerId: customerId });

						if (user) {
							const newConnection = await BankConnection.create({
								userId: user._id,
								monoCustomerId: customerId,
								monoAccountId: accountId,
								accountName: fullAccount.name,
								accountNumber: fullAccount.account_number,
								bankName: fullAccount.institution?.name,
								balance: fullAccount.balance,
								currency: fullAccount.currency,
								bvn: fullAccount.bvn,
								status: "Active",
								lastSync: new Date(),
								provider: "mono",
							});

							console.log(
								"✅ Recovered connection during reauthorization:",
								accountId,
							);
							console.log("   User ID:", user._id);
						} else {
							console.log("❌ No user found for reauthorization recovery");
						}
					}
				} catch (apiError) {
					console.error(
						"❌ Failed to recover connection during reauthorization:",
						apiError.message,
					);
				}
				return;
			}

			// Update existing connection
			connection.status = "Active";
			connection.lastSync = new Date();
			await connection.save();

			console.log("✅ Account reauthorized and updated:", accountId);
			return;
		}

		console.log("⚠️ Unknown event type:", eventType);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
