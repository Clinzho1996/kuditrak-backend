// controllers/accountController.js
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";
import { checkLimits } from "../services/subscriptionService.js";

export const initiateBankLink = async (req, res) => {
	try {
		// Check subscription / limits
		await checkLimits(req.user._id, "bank_connection");

		const { name, email } = req.body;

		// Unique reference
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const uniqueRef = `LINK_${timestamp}_${randomStr}`;

		const response = await mono.post("/accounts/initiate", {
			customer: { name, email }, // still needed for Mono link
			meta: { ref: uniqueRef },
			scope: "auth",
			redirect_url: "https://kuditrak.com/mono-redirect",
		});

		res.status(200).json({
			success: true,
			monoUrl: response.data.data.mono_url,
			ref: uniqueRef,
		});
	} catch (err) {
		console.error(
			"Initiate bank link error:",
			err.response?.data || err.message,
		);
		res.status(500).json({
			success: false,
			error: err.message || "Failed to initiate bank linking",
			details: err.response?.data,
		});
	}
};

/**
 * Save Mono customer ID to user profile
 */
export const saveMonoCustomerId = async (req, res) => {
	try {
		const { monoCustomerId } = req.body;
		req.user.monoCustomerId = monoCustomerId;
		await req.user.save();

		res.status(200).json({ success: true, monoCustomerId });
	} catch (err) {
		console.error("Save customer ID error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
};

/**
 * Link bank account (optional extra if using direct v2)
 */
export const linkBankAccount = async (req, res) => {
	try {
		const { accountId } = req.body; // Mono account ID from front-end

		// Check subscription
		const user = await User.findById(req.user._id);
		if (user.subscription?.plan === "free") {
			return res.status(403).json({
				success: false,
				error:
					"Bank linking not available on free plan. Upgrade to connect accounts.",
				requiresUpgrade: true,
			});
		}

		// Fetch account details from Mono
		const response = await mono.get(`/accounts/${accountId}`);
		const account = response.data.data;

		// Check if account already exists
		const existing = await BankConnection.findOne({
			userId: req.user._id,
			accountNumber: account.account_number,
			bankName: account.institution.name,
			status: "Active",
		});
		if (existing) {
			return res
				.status(400)
				.json({ success: false, error: "Bank account already linked" });
		}

		// Save bank connection
		const connection = await BankConnection.create({
			userId: req.user._id,
			accountName: account.name,
			accountNumber: account.account_number,
			bankName: account.institution.name,
			monoCustomerId: account.customer.id,
			monoAccountId: account.id,
			provider: "mono",
			status: "Active",
		});

		res.status(200).json({ success: true, connection });
	} catch (err) {
		console.error("Link account error:", err.response?.data || err.message);
		res.status(500).json({
			success: false,
			error: err.message || "Failed to link bank account",
			details: err.response?.data,
		});
	}
};

/**
 * Fetch all bank accounts for a user (handles pagination)
 */
export const getUserBankAccounts = async (req, res) => {
	try {
		const accounts = await BankConnection.find({
			userId: req.user._id,
			status: "Active",
		}).sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			accounts,
		});
	} catch (err) {
		console.error("Fetch accounts error:", err.message);
		res.status(500).json({
			success: false,
			error: err.message || "Failed to fetch bank accounts",
		});
	}
};

/**
 * Unlink a bank account
 */
export const unlinkBankAccount = async (req, res) => {
	try {
		const { accountId } = req.params;

		const account = await BankConnection.findOne({
			_id: accountId,
			userId: req.user._id,
		});
		if (!account) return res.status(404).json({ error: "Account not found" });

		account.status = "Unlinked";
		await account.save();

		res
			.status(200)
			.json({ success: true, message: "Account unlinked successfully" });
	} catch (err) {
		console.error("Unlink account error:", err.message);
		res.status(500).json({ error: err.message });
	}
};

export const fetchAllMonoAccounts = async () => {
	let accounts = [];
	let url = "https://api.withmono.com/v2/accounts"; // start with full URL

	try {
		while (url) {
			const res = await mono.get(url); // mono already has baseURL, but we pass full URL here
			accounts = accounts.concat(res.data.data);

			if (res.data.meta.next) {
				url = res.data.meta.next; // full URL for next page
			} else {
				url = null; // stop loop
			}
		}

		return accounts;
	} catch (err) {
		console.error(
			"Error fetching Mono accounts:",
			err.response?.data || err.message,
		);
		throw new Error("Failed to fetch Mono accounts");
	}
};
