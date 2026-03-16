import mongoose from "mongoose";
import SavingsBucket from "../models/SavingsBucket.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { initiatePayout } from "../services/paymentGateway.js";

import { createTopUp, verifyTopUp } from "../services/paymentGateway.js";

export const topUpWallet = async (req, res) => {
	try {
		const { amount } = req.body;

		const reference = `TRX-${Date.now()}-${req.user._id}`;

		const { paymentLink } = await createTopUp({
			email: req.user.email,
			amount,
			reference,
		});

		const wallet = await Wallet.findOne({ userId: req.user._id });

		await Transaction.create({
			userId: req.user._id,
			walletId: wallet._id,
			transactionId: reference,
			type: "income",
			amount,
			source: "wallet",
			status: "Pending",
			description: "Wallet Top Up",
		});

		res.json({ paymentLink, reference });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const verifyWalletTopUp = async (req, res) => {
	try {
		const reference =
			req.query.reference || req.query.trxref || req.body.reference;

		if (!reference) {
			return res.status(400).json({ error: "Reference is required" });
		}

		const verification = await verifyTopUp(reference);

		if (!verification.status || verification.data.status !== "success") {
			return res.status(400).json({ error: "Payment not successful" });
		}

		const transaction = await Transaction.findOne({
			transactionId: reference,
		});

		if (!transaction) {
			return res.status(404).json({ error: "Transaction not found" });
		}

		const wallet = await Wallet.findOne({ userId: transaction.userId });

		if (!wallet) {
			return res.status(404).json({ error: "Wallet not found for this user" });
		}

		if (transaction.status === "Completed") {
			return res.json({ message: "Transaction already processed" });
		}

		const amount = verification.data.amount / 100;

		wallet.balance += amount;
		wallet.available += amount;

		await wallet.save();

		transaction.status = "Completed";
		await transaction.save();

		res.json({
			message: "Wallet funded successfully",
			amount,
			balance: wallet.balance,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

export const transferFunds = async (req, res) => {
	const { recipientId, amount } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(
			session,
		);
		const recipientWallet = await Wallet.findOne({
			userId: recipientId,
		}).session(session);
		if (!recipientWallet) throw new Error("Recipient not found");
		if (senderWallet.available < amount)
			throw new Error("Insufficient balance");

		senderWallet.balance -= amount;
		senderWallet.available -= amount;
		recipientWallet.balance += amount;
		recipientWallet.available += amount;

		await senderWallet.save({ session });
		await recipientWallet.save({ session });

		await Transaction.create(
			[
				{
					walletId: senderWallet._id,
					userId: req.user._id,
					type: "Transfer",
					amount,
					status: "Completed",
					metadata: {
						fromUserId: req.user._id,
						toUserId: recipientId,
						reference: `TRX-${Date.now()}`,
					},
				},
			],
			{ session },
		);

		await session.commitTransaction();
		session.endSession();
		res.status(200).json({ message: "Transfer successful" });
	} catch (err) {
		await session.abortTransaction();
		session.endSession();
		res.status(400).json({ error: err.message });
	}
};

export const allocateSavings = async (req, res) => {
	const { bucketId, amount } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const wallet = await Wallet.findOne({ userId: req.user._id }).session(
			session,
		);
		if (!wallet) throw new Error("Wallet not found");
		if (Number(wallet.available) < Number(amount))
			throw new Error("Insufficient balance");

		const bucket = await SavingsBucket.findOne({
			_id: bucketId,
			userId: req.user._id,
		}).session(session);
		if (!bucket) throw new Error("Bucket not found");

		// CAST BOTH wallet and amount to numbers to prevent concatenation
		wallet.allocated = Number(wallet.allocated || 0) + Number(amount);
		wallet.available = Number(wallet.available || 0) - Number(amount);
		await wallet.save({ session });

		bucket.currentAmount = Number(bucket.currentAmount || 0) + Number(amount);
		await bucket.save({ session });

		const transactionId = `TRX-${req.user._id}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

		await Transaction.create(
			[
				{
					walletId: wallet._id,
					userId: req.user._id,
					transactionId,
					type: "expense",
					amount: Number(amount),
					status: "Completed",
					description: "Savings allocation",
					source: "wallet",
					metadata: { bucketId, reference: transactionId },
				},
			],
			{ session },
		);

		await session.commitTransaction();
		session.endSession();

		res
			.status(200)
			.json({ message: "Allocated to savings bucket", bucket, wallet });
	} catch (err) {
		await session.abortTransaction();
		session.endSession();
		res.status(400).json({ error: err.message });
	}
};

export const getBalance = async (req, res) => {
	const wallet = await Wallet.findOne({ userId: req.user._id });
	res.status(200).json({
		balance: wallet.balance,
		allocated: wallet.allocated,
		available: wallet.available,
	});
};

export const withdrawToBank = async (req, res) => {
	const { amount, bankAccountId } = req.body;

	if (!amount || amount <= 0) {
		return res.status(400).json({ error: "Invalid withdrawal amount" });
	}

	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const wallet = await Wallet.findOne({ userId: req.user._id }).session(
			session,
		);
		if (!wallet) throw new Error("Wallet not found");

		if (Number(wallet.available) < Number(amount)) {
			throw new Error("Insufficient available balance");
		}

		// Initiate payout to bank account
		const payoutReference = `PAYOUT-${req.user._id}-${Date.now()}`;
		const payoutResult = await initiatePayout({
			amount: Number(amount),
			userId: req.user._id,
			bankAccountId,
			reference: payoutReference,
		});

		if (!payoutResult.success) {
			throw new Error("Payout failed: " + payoutResult.message);
		}

		// Deduct from wallet
		wallet.balance = Number(wallet.balance) - Number(amount);
		wallet.available = Number(wallet.available) - Number(amount);
		await wallet.save({ session });

		// Record transaction
		await Transaction.create(
			[
				{
					walletId: wallet._id,
					userId: req.user._id,
					transactionId: payoutReference,
					type: "expense",
					amount: Number(amount),
					status: "Completed",
					description: "Withdrawal to bank account",
					source: "wallet",
					metadata: { bankAccountId, reference: payoutReference },
				},
			],
			{ session },
		);

		await session.commitTransaction();
		session.endSession();

		res.status(200).json({
			message: "Withdrawal successful",
			amount,
			balance: wallet.balance,
			payoutReference,
		});
	} catch (err) {
		await session.abortTransaction();
		session.endSession();
		res.status(400).json({ error: err.message });
	}
};
