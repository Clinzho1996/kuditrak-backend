import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";
import { checkLimits } from "../services/subscriptionService.js";

/**
 * Step 1: Initiate bank link → returns link + monoCustomerId
 */
export const initiateBankLink = async (req, res) => {
	try {
		await checkLimits(req.user._id, "bank_connection");

		const { name, email } = req.body;

		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const uniqueRef = `LINK_${timestamp}_${randomStr}`;

		const response = await mono.post("/accounts/initiate", {
			customer: { name, email },
			meta: { ref: uniqueRef },
			scope: "auth",
			redirect_url: "https://kuditrak.com/mono-redirect",
		});

		const monoCustomerId = response.data.data.customer.id;

		res.status(200).json({
			success: true,
			monoUrl: response.data.data.mono_url,
			monoCustomerId,
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

		const response = await mono.get(`/accounts/${accountId}`);
		const account = response.data.data;

		const existing = await BankConnection.findOne({
			userId: user._id,
			monoAccountId: account.id,
		});
		if (existing)
			return res
				.status(400)
				.json({ success: false, error: "Account already linked" });

		const connection = await BankConnection.create({
			userId: user._id,
			monoCustomerId: user.monoCustomerId,
			monoAccountId: account.id,
			accountName: account.name,
			accountNumber: account.account_number,
			bankName: account.institution?.name || "Unknown",
			provider: "mono",
			status: "Active",
			lastSync: new Date(),
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
