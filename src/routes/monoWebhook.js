// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";

const router = express.Router();

// Helper function to get bank code from bank name
const getBankCode = (bankName) => {
	if (!bankName) return null;

	const bankCodes = {
		GTBank: "058",
		"Guaranty Trust Bank": "058",
		"Access Bank": "044",
		"Access Bank Plc": "044",
		"Wema Bank": "035",
		"Wema Bank Plc": "035",
		UBA: "033",
		"United Bank For Africa": "033",
		"First Bank": "011",
		"First Bank of Nigeria": "011",
		"Zenith Bank": "057",
		"Zenith Bank Plc": "057",
		FCMB: "214",
		"First City Monument Bank": "214",
		"Stanbic IBTC": "039",
		"Stanbic IBTC Bank": "039",
		"Polaris Bank": "076",
		"Polaris Bank Limited": "076",
		"Union Bank of Nigeria": "032",
		"Union Bank": "032",
		"Fidelity Bank": "070",
		"Fidelity Bank Plc": "070",
		"Sterling Bank": "232",
		"Sterling Bank Plc": "232",
		Ecobank: "050",
		"Ecobank Nigeria": "050",
		"Kuda Bank": "50211",
		"Kuda Microfinance Bank": "50211",
	};

	// Try exact match first
	if (bankCodes[bankName]) return bankCodes[bankName];

	// Try partial match
	for (const [key, code] of Object.entries(bankCodes)) {
		if (
			bankName.toLowerCase().includes(key.toLowerCase()) ||
			key.toLowerCase().includes(bankName.toLowerCase())
		) {
			return code;
		}
	}

	return null;
};

// Helper function to safely create/update connection with retry logic
async function safeUpsertConnection(accountId, updateData) {
	try {
		// Try to find and update existing connection first
		const connection = await BankConnection.findOneAndUpdate(
			{ monoAccountId: accountId },
			{ $set: updateData },
			{
				new: true,
				upsert: false,
				runValidators: true,
			},
		);

		if (connection) {
			return connection;
		}

		// If not found, try to create
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
					status: "Processing",
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

			// Extract data from the webhook payload
			const accountName = accountData.name;
			const accountNumber = accountData.accountNumber;
			const bankName = accountData.institution?.name;
			const bankCodeFromMono = accountData.institution?.bankCode;
			const balance = accountData.balance;
			const currency = accountData.currency;
			const bvn = accountData.bvn;
			const customerId = accountData.customer || payload.customer;

			console.log(`📋 Account Details from webhook:`);
			console.log(`   Account Name: ${accountName}`);
			console.log(`   Account Number: ${accountNumber}`);
			console.log(`   Bank Name: ${bankName}`);
			console.log(`   Bank Code from Mono: ${bankCodeFromMono}`);
			console.log(`   Balance: ${balance}`);
			console.log(`   BVN: ${bvn}`);

			// Find the user by monoCustomerId
			let user = null;
			if (customerId) {
				user = await User.findOne({ monoCustomerId: customerId });
			}

			// If no user found by monoCustomerId, try to find by any existing connection
			if (!user) {
				const existingConnection = await BankConnection.findOne({
					monoAccountId: accountId,
				});
				if (existingConnection && existingConnection.userId) {
					user = await User.findById(existingConnection.userId);
				}
			}

			if (!user) {
				console.log("❌ No user found for this account");
				return;
			}

			// Get bank code (use Mono's bankCode if available, otherwise map from bank name)
			let bankCode = bankCodeFromMono;
			if (!bankCode || bankCode === "000000") {
				bankCode = getBankCode(bankName);
				console.log(`   Mapped Bank Code: ${bankCode}`);
			}

			// Prepare update data with ALL account details
			const updateData = {
				userId: user._id,
				monoCustomerId: customerId || user.monoCustomerId,
				accountName: accountName,
				accountNumber: accountNumber,
				bankName: bankName,
				bankCode: bankCode, // IMPORTANT: Save the bank code
				balance: balance || 0,
				currency: currency || "NGN",
				bvn: bvn,
				status: "Active",
				lastSync: new Date(),
				provider: "mono",
			};

			console.log(`📝 Updating account with:`);
			console.log(`   Bank Name: ${updateData.bankName}`);
			console.log(`   Bank Code: ${updateData.bankCode}`);
			console.log(`   Account: ${updateData.accountNumber}`);

			// Use safe upsert to handle race conditions
			const connection = await safeUpsertConnection(accountId, updateData);

			console.log("✅ Account updated successfully:");
			console.log("   Account ID:", accountId);
			console.log("   Account Name:", connection.accountName);
			console.log("   Account Number:", connection.accountNumber);
			console.log("   Bank:", connection.bankName);
			console.log("   Bank Code:", connection.bankCode);
			console.log("   Balance:", connection.balance);
			console.log("   Status:", connection.status);
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
							const bankCode = getBankCode(fullAccount.institution?.name);

							const updateData = {
								userId: user._id,
								monoCustomerId: customerId,
								accountName: fullAccount.name,
								accountNumber: fullAccount.account_number,
								bankName: fullAccount.institution?.name,
								bankCode: bankCode,
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
							console.log("   Bank Code:", bankCode);
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
					console.log("   Bank Code:", connection.bankCode);
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
