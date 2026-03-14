import SavingsBucket from "../models/SavingsBucket.js";
import Wallet from "../models/Wallet.js";

// Create a new savings bucket
export const createBucket = async (req, res) => {
	try {
		const { name, targetAmount } = req.body;
		let wallet = await Wallet.findOne({ userId: req.user._id });

		if (!wallet) {
			wallet = await Wallet.create({ userId: req.user._id });
		}

		const bucket = new SavingsBucket({
			userId: req.user._id,
			walletId: wallet._id,
			name,
			targetAmount,
			currentAmount: 0,
		});

		await bucket.save();
		res.status(201).json(bucket);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// List all buckets for the user
export const listBuckets = async (req, res) => {
	try {
		const buckets = await SavingsBucket.find({ userId: req.user._id });
		res.status(200).json(buckets);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Update bucket (e.g., rename or adjust target)
export const updateBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const updated = await SavingsBucket.findOneAndUpdate(
			{ _id: id, userId: req.user._id },
			req.body,
			{ new: true },
		);
		if (!updated) return res.status(404).json({ error: "Bucket not found" });
		res.json(updated);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Delete a bucket
export const deleteBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const deleted = await SavingsBucket.findOneAndDelete({
			_id: id,
			userId: req.user._id,
		});
		if (!deleted) return res.status(404).json({ error: "Bucket not found" });
		res.json({ message: "Bucket deleted" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Credit a bucket (deposit money)
export const creditBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { amount } = req.body;

		if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});
		if (!bucket) return res.status(404).json({ error: "Bucket not found" });

		const wallet = await Wallet.findOne({ userId: req.user._id });
		if (!wallet) return res.status(404).json({ error: "Wallet not found" });
		if (wallet.balance < amount)
			return res.status(400).json({ error: "Insufficient wallet balance" });

		// Deduct from wallet
		wallet.balance -= amount;
		await wallet.save();

		// Credit the bucket
		bucket.currentAmount += amount;
		await bucket.save();

		res.json({ bucket, wallet });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const withdrawFromBucket = async (req, res) => {
	try {
		const { id } = req.params;
		const { amount } = req.body;

		if (!amount || amount <= 0) {
			return res.status(400).json({ error: "Invalid withdrawal amount" });
		}

		const bucket = await SavingsBucket.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!bucket) {
			return res.status(404).json({ error: "Bucket not found" });
		}

		if (bucket.currentAmount < amount) {
			return res.status(400).json({ error: "Insufficient funds in bucket" });
		}

		let wallet = await Wallet.findOne({ userId: req.user._id });

		if (!wallet) {
			return res.status(404).json({ error: "Wallet not found" });
		}

		// Deduct from bucket
		bucket.currentAmount -= amount;
		await bucket.save();

		// Credit wallet
		wallet.balance += amount;
		await wallet.save();

		res.status(200).json({
			message: "Withdrawal successful",
			bucket,
			wallet,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
