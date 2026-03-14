import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { createTopUp } from "../services/paymentGateway.js";

export const topUpWallet = async (req, res) => {
	const { amount } = req.body;
	const reference = `TRX-${Date.now()}-${req.user._id}`;
	const { paymentLink } = await createTopUp({ userId: req.user._id, amount });

	await Transaction.create({
		walletId: req.user.walletId,
		userId: req.user._id,
		type: "TopUp",
		amount,
		status: "Pending",
		metadata: { reference },
	});

	res.status(200).json({ paymentLink, reference });
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
		if (wallet.available < amount) throw new Error("Insufficient balance");

		wallet.allocated += amount;
		wallet.available -= amount;
		await wallet.save({ session });

		await Transaction.create(
			[
				{
					walletId: wallet._id,
					userId: req.user._id,
					type: "SavingsAllocation",
					amount,
					status: "Completed",
					metadata: { bucketId, reference: `TRX-${Date.now()}` },
				},
			],
			{ session },
		);

		await session.commitTransaction();
		session.endSession();
		res.status(200).json({ message: "Allocated to savings bucket" });
	} catch (err) {
		await session.abortTransaction();
		session.endSession();
		res.status(400).json({ error: err.message });
	}
};

export const getBalance = async (req, res) => {
	const wallet = await Wallet.findOne({ userId: req.user._id });
	res
		.status(200)
		.json({
			balance: wallet.balance,
			allocated: wallet.allocated,
			available: wallet.available,
		});
};
