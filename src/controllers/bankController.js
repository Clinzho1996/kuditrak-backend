import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";
import { checkLimits } from "../services/subscriptionService.js";

/**
 * Step 1: Initiate bank link → returns link + monoCustomerId
 */
export const initiateBankLink = async (req, res) => {
	try {
		// Check subscription limits before initiating
		await checkLimits(req.user._id, "bank_connection");

		const { name, email } = req.body;

		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const uniqueRef = `LINK_${timestamp}_${randomStr}`;

		// Mono API expects either:
		// 1. customer object for new customers
		// 2. customer_id for existing customers (if they have one)
		// But you CANNOT send both

		let requestData = {
			meta: { ref: uniqueRef },
			scope: "auth",
			redirect_url: "https://kuditrak.com/mono-redirect",
		};

		// Check if user already has a Mono customer ID
		if (req.user.monoCustomerId) {
			// For existing customers, use customer_id (not customer object)
			requestData.customer_id = req.user.monoCustomerId;
			console.log(
				"Linking additional account for existing customer:",
				req.user.monoCustomerId,
			);
		} else {
			// For new customers, use customer object
			requestData.customer = { name, email };
			console.log("Creating new Mono customer");
		}

		const response = await mono.post("/accounts/initiate", requestData);

		console.log("Mono initiate response:", response.data);

		// If this is a new customer, save the ID
		if (!req.user.monoCustomerId && response.data.data.customer?.id) {
			req.user.monoCustomerId = response.data.data.customer.id;
			await req.user.save();
			console.log("Saved new Mono customer ID:", req.user.monoCustomerId);
		}

		res.status(200).json({
			success: true,
			monoUrl: response.data.data.mono_url,
			monoCustomerId:
				req.user.monoCustomerId || response.data.data.customer?.id,
			ref: uniqueRef,
		});
	} catch (err) {
		console.error(
			"Initiate bank link error:",
			err.response?.data || err.message,
		);

		// Handle subscription limit error specifically
		if (err.message.includes("Bank connection limit reached")) {
			return res.status(403).json({
				success: false,
				error: err.message,
				requiresUpgrade: true,
			});
		}

		// Handle Mono API errors
		if (err.response?.data) {
			return res.status(500).json({
				success: false,
				error: err.response.data.message || "Failed to initiate bank linking",
				details: err.response.data,
			});
		}

		res.status(500).json({
			success: false,
			error: err.message || "Failed to initiate bank linking",
		});
	}
};

/**
 * Step 2: Save monoCustomerId to user before webhook
 */
export const saveMonoCustomerId = async (req, res) => {
	try {
		const { monoCustomerId } = req.body;
		if (!monoCustomerId) throw new Error("Missing monoCustomerId");

		req.user.monoCustomerId = monoCustomerId;
		await req.user.save();

		res.status(200).json({ success: true, monoCustomerId });
	} catch (err) {
		console.error("Save customer ID error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
};

/**
 * Optional: direct linking for v2 accounts (frontend can skip if using webhook)
 */
export const linkBankAccount = async (req, res) => {
	try {
		const { accountId } = req.body;

		const user = await User.findById(req.user._id);
		if (!user.monoCustomerId) {
			return res.status(400).json({
				success: false,
				error: "Mono customer ID not saved. Initiate account first.",
			});
		}

		// Check subscription limits before linking
		await checkLimits(req.user._id, "bank_connection");

		const response = await mono.get(`/accounts/${accountId}`);
		const account = response.data.data;

		const existing = await BankConnection.findOne({
			userId: user._id,
			monoAccountId: account.id,
		});
		if (existing) {
			return res.status(400).json({
				success: false,
				error: "Account already linked",
			});
		}

		const connection = await BankConnection.create({
			userId: user._id,
			monoCustomerId: user.monoCustomerId,
			monoAccountId: account.id,
			accountName: account.name,
			accountNumber: account.account_number,
			bankName: account.institution?.name || "Unknown",
			balance: account.balance,
			currency: account.currency,
			bvn: account.bvn,
			provider: "mono",
			status: "Active",
			lastSync: new Date(),
		});

		res.status(200).json({ success: true, connection });
	} catch (err) {
		console.error("Link account error:", err.response?.data || err.message);

		// Handle subscription limit error specifically
		if (err.message.includes("Bank connection limit reached")) {
			return res.status(403).json({
				success: false,
				error: err.message,
				requiresUpgrade: true,
				currentLimit: err.message.match(/\d+/)?.[0] || null,
			});
		}

		res.status(500).json({
			success: false,
			error: err.message || "Failed to link bank account",
			details: err.response?.data,
		});
	}
};

/**
 * Get user bank accounts
 */
export const getUserBankAccounts = async (req, res) => {
	try {
		const accounts = await BankConnection.find({
			userId: req.user._id,
			status: "Active",
		}).sort({ lastSync: -1 });

		res.status(200).json({ success: true, accounts });
	} catch (err) {
		console.error("Get user bank accounts error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
};

// Add this to your monoController.js
export const syncMissingAccounts = async (req, res) => {
	try {
		const user = await User.findById(req.user._id);
		if (!user.monoCustomerId) {
			return res.status(400).json({
				success: false,
				error: "No Mono customer ID found for this user",
			});
		}

		// Fetch all accounts for this customer from Mono
		const response = await mono.get(
			`/customers/${user.monoCustomerId}/accounts`,
		);
		const accounts = response.data.data;

		const syncedAccounts = [];
		const errors = [];

		for (const account of accounts) {
			try {
				// Check if account already exists
				let connection = await BankConnection.findOne({
					monoAccountId: account.id,
				});

				if (!connection) {
					// Create new connection
					connection = await BankConnection.create({
						userId: user._id,
						monoCustomerId: user.monoCustomerId,
						monoAccountId: account.id,
						accountName: account.name,
						accountNumber: account.account_number,
						bankName: account.institution?.name,
						balance: account.balance,
						currency: account.currency,
						bvn: account.bvn,
						status: "Active",
						lastSync: new Date(),
						provider: "mono",
					});
					syncedAccounts.push(connection);
				} else {
					// Update existing connection
					connection.accountName = account.name || connection.accountName;
					connection.accountNumber =
						account.account_number || connection.accountNumber;
					connection.bankName =
						account.institution?.name || connection.bankName;
					connection.balance = account.balance ?? connection.balance;
					connection.currency = account.currency || connection.currency;
					connection.bvn = account.bvn || connection.bvn;
					connection.lastSync = new Date();
					await connection.save();
					syncedAccounts.push(connection);
				}
			} catch (err) {
				errors.push({ account: account.id, error: err.message });
			}
		}

		res.status(200).json({
			success: true,
			message: `Synced ${syncedAccounts.length} accounts`,
			syncedAccounts,
			errors,
		});
	} catch (err) {
		console.error("Sync missing accounts error:", err.message);
		res.status(500).json({
			success: false,
			error: err.message,
		});
	}
};
