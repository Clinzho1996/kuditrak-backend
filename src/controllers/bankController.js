import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

import mono from "../services/monoService.js";
import { checkLimits } from "../services/subscriptionService.js";

export const initiateBankLink = async (req, res) => {
	try {
		const { name, email } = req.body;

		await checkLimits(req.user._id, "bank_connection");

		// Generate a unique reference
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const uniqueRef = `LINK_${req.user._id.substring(0, 8)}_${timestamp}_${randomStr}`;

		console.log("Generated unique ref:", uniqueRef);

		const response = await mono.post("/accounts/initiate", {
			customer: { name, email },
			meta: {
				ref: uniqueRef,
				userId: req.user._id.toString(),
			},
			scope: "auth",
			redirect_url: "https://kuditrak.com/mono-redirect", // Update this to your actual redirect URL
		});

		console.log("Mono response:", response.data);

		res.status(200).json({
			success: true,
			monoUrl: response.data.data.mono_url,
			customerId: response.data.data.customer,
			ref: uniqueRef,
		});
	} catch (err) {
		console.error("Mono error details:", err.response?.data || err.message);
		res.status(500).json({
			error: err.response?.data?.message || err.message,
			details: err.response?.data,
		});
	}
};

export const linkBankAccount = async (req, res) => {
	try {
		const { code } = req.body;

		const response = await mono.post("/accounts/auth", { code });
		const account = response.data.data; // <-- important

		await checkLimits(req.user._id, "bank_connection");

		const user = await User.findById(req.user.id);

		if (user.subscription.plan === "free") {
			return res.status(403).json({
				error: "Upgrade to connect bank accounts",
			});
		}

		const connection = await BankConnection.create({
			userId: req.user._id,
			accountName: account.account.name,
			accountNumber: account.account.number,
			bankName: account.account.institution.name,
			monoAccountId: account.id,
			status: "Active",
		});

		res.status(200).json({
			success: true,
			connection,
		});
	} catch (err) {
		console.error(err.response?.data || err.message);
		res.status(500).json({ error: err.message });
	}
};
export const getUserBankAccounts = async (req, res) => {
	try {
		const accounts = await BankConnection.find({
			userId: req.user._id,
			status: "Active",
		});

		res.status(200).json({
			success: true,
			accounts,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const saveMonoCustomerId = async (req, res) => {
	try {
		const { monoCustomerId } = req.body;

		req.user.monoCustomerId = monoCustomerId;
		await req.user.save();

		res.status(200).json({
			success: true,
			monoCustomerId,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const unlinkBankAccount = async (req, res) => {
	try {
		const { accountId } = req.params;

		const account = await BankConnection.findOne({
			_id: accountId,
			userId: req.user._id,
		});

		if (!account) {
			return res.status(404).json({ error: "Account not found" });
		}

		account.status = "Unlinked";
		await account.save();

		res.status(200).json({
			success: true,
			message: "Account unlinked",
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
