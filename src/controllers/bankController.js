import BankConnection from "../models/BankConnection.js";

import mono from "../services/monoService.js";

export const linkBankAccount = async (req, res) => {
	try {
		const { code } = req.body;

		const response = await mono.post("/account/auth", {
			code,
		});

		const account = response.data;

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
