// controllers/accountController.js
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import mono from "../services/monoService.js";
import { checkLimits } from "../services/subscriptionService.js";

export const initiateBankLink = async (req, res) => {
	try {
		const { name, email } = req.body;

		// Check limits - this will throw if user has reached their limit
		try {
			await checkLimits(req.user._id, "bank_connection");
		} catch (limitError) {
			console.log("Limit check failed:", limitError.message);
			return res.status(403).json({
				success: false,
				error: limitError.message,
				requiresUpgrade: true,
			});
		}

		// Convert ObjectId to string for the ref
		const userId = req.user._id.toString();

		// Generate a unique reference
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const uniqueRef = `LINK_${timestamp}_${randomStr}`;

		console.log("Generated unique ref:", uniqueRef);
		console.log("User ID:", userId);

		const response = await mono.post("/accounts/initiate", {
			customer: { name, email },
			meta: {
				ref: uniqueRef,
				userId: userId,
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
			success: false,
			error:
				err.response?.data?.message ||
				err.message ||
				"Failed to initiate bank linking",
			details: err.response?.data,
		});
	}
};

export const linkBankAccount = async (req, res) => {
	try {
		const { code } = req.body;

		console.log("Linking bank account with code:", code);

		// First, check if the user is allowed to link accounts
		try {
			await checkLimits(req.user._id, "bank_connection");
		} catch (limitError) {
			console.log("Limit check failed during linking:", limitError.message);
			return res.status(403).json({
				success: false,
				error: limitError.message,
				requiresUpgrade: true,
			});
		}

		const response = await mono.post("/accounts/auth", { code });
		const account = response.data.data;

		console.log("Mono account data:", account);

		const user = await User.findById(req.user._id);

		// Double-check subscription plan
		if (user.subscription?.plan === "free") {
			return res.status(403).json({
				success: false,
				error:
					"Bank account linking is not available on the free plan. Please upgrade to connect bank accounts.",
				requiresUpgrade: true,
			});
		}

		// Check if account already exists
		const existingAccount = await BankConnection.findOne({
			userId: req.user._id,
			accountNumber: account.account.number,
			bankName: account.account.institution.name,
			status: "Active",
		});

		if (existingAccount) {
			return res.status(400).json({
				success: false,
				error: "This bank account is already linked",
			});
		}

		const connection = await BankConnection.create({
			userId: req.user._id,
			accountName: account.account.name,
			accountNumber: account.account.number,
			bankName: account.account.institution.name,
			monoAccountId: account.id,
			provider: "mono",
			status: "Active",
		});

		res.status(200).json({
			success: true,
			connection,
		});
	} catch (err) {
		console.error("Link account error:", err.response?.data || err.message);
		res.status(500).json({
			success: false,
			error: err.message || "Failed to link bank account",
			details: err.response?.data,
		});
	}
};

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
		console.error("Get accounts error:", err.message);
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
		console.error("Save customer ID error:", err.message);
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
			message: "Account unlinked successfully",
		});
	} catch (err) {
		console.error("Unlink account error:", err.message);
		res.status(500).json({ error: err.message });
	}
};
