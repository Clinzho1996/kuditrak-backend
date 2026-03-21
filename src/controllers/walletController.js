import axios from "axios";
import mongoose from "mongoose";
import SavingsBucket from "../models/SavingsBucket.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { initiatePayout } from "../services/paymentGateway.js";

import { createTopUp } from "../services/paymentGateway.js";

// backend/controllers/walletController.js
export const topUpWallet = async (req, res) => {
	try {
		const { amount } = req.body;

		// Make sure userId is passed correctly
		const userId = req.user._id;

		const reference = `TRX-${Date.now()}-${userId.toString().substring(0, 8)}`;

		const { paymentLink } = await createTopUp({
			email: req.user.email,
			amount,
			reference,
			userId: userId, // Add this line - pass the userId
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
		console.error("Topup error:", err);
		res.status(500).json({ error: err.message });
	}
};

// backend/controllers/walletController.js
export const verifyWalletTopUp = async (req, res) => {
	try {
		const reference =
			req.query.reference || req.query.trxref || req.body.reference;

		console.log("🔔 VerifyWalletTopUp called");
		console.log("Reference:", reference);
		console.log("Query params:", req.query);

		if (!reference) {
			console.error("No reference provided");
			return res.redirect("kuditrak://payment/failed?error=missing_reference");
		}

		// Call the payment gateway to verify with Paystack
		const verification = await verifyWithPaystack(reference);

		if (!verification.status || verification.data.status !== "success") {
			console.error("Payment verification failed");
			return res.redirect(
				`kuditrak://payment/failed?reference=${reference}&error=verification_failed`,
			);
		}

		const transaction = await Transaction.findOne({
			transactionId: reference,
		});

		if (!transaction) {
			console.error("Transaction not found:", reference);
			return res.redirect(
				"kuditrak://payment/failed?error=transaction_not_found",
			);
		}

		const wallet = await Wallet.findOne({ userId: transaction.userId });

		if (!wallet) {
			console.error("Wallet not found for user:", transaction.userId);
			return res.redirect("kuditrak://payment/failed?error=wallet_not_found");
		}

		if (transaction.status === "Completed") {
			console.log("Transaction already processed");
			return res.redirect(
				`kuditrak://payment/success?reference=${reference}&amount=${verification.data.amount / 100}`,
			);
		}

		const amount = verification.data.amount / 100;

		wallet.balance += amount;
		wallet.available += amount;
		await wallet.save();

		transaction.status = "Completed";
		await transaction.save();

		console.log(
			`✅ Wallet funded: +₦${amount}, New balance: ₦${wallet.balance}`,
		);

		// Redirect to app deep link
		const appDeepLink = `kuditrak://payment/success?reference=${reference}&amount=${amount}`;
		console.log("🔗 Redirecting to app:", appDeepLink);

		return res.redirect(appDeepLink);
	} catch (error) {
		console.error("Verify wallet topup error:", error.message);
		const reference = req.query?.reference || req.query?.trxref || "unknown";
		return res.redirect(
			`kuditrak://payment/failed?reference=${reference}&error=${encodeURIComponent(error.message)}`,
		);
	}
};

// Helper function to verify with Paystack
const verifyWithPaystack = async (reference) => {
	try {
		const response = await axios.get(
			`https://api.paystack.co/transaction/verify/${reference}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
				},
			},
		);
		return response.data;
	} catch (error) {
		console.error(
			"Paystack verification error:",
			error.response?.data || error.message,
		);
		throw new Error("Failed to verify payment with Paystack");
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
