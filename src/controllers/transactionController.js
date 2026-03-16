import BankConnection from "../models/BankConnection.js";
import Budget from "../models/Budget.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import mono from "../services/monoService.js";

// List all transactions
export const listTransactions = async (req, res) => {
	try {
		const transactions = await Transaction.find({ userId: req.user._id })
			.populate("categoryId", "name type")
			.sort({ date: -1 });

		res.status(200).json({ success: true, transactions });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Create manual transaction
export const createTransaction = async (req, res) => {
	try {
		const { amount, type, description, categoryId, date } = req.body;

		if (!amount || !type) {
			return res.status(400).json({ error: "Amount and type are required" });
		}

		if (!["income", "expense"].includes(type)) {
			return res.status(400).json({ error: "Invalid transaction type" });
		}

		console.log("Creating transaction for user:", req.user._id);

		if (!req.user || !req.user._id) {
			return res.status(401).json({ error: "Unauthorized: user missing" });
		}

		let categoryName = null;
		if (categoryId) {
			const category = await Category.findOne({
				_id: categoryId,
				userId: req.user._id,
			});

			if (!category) {
				return res.status(400).json({ error: "Invalid category selected" });
			}

			categoryName = category.name;
		}

		const transactionId = `TRX-${req.user._id}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

		const transaction = await Transaction.create({
			userId: req.user._id,
			amount: Number(amount),
			type,
			description: description || "",
			categoryId: categoryId || null,
			categoryName,
			source: "manual", // matches enum
			date: date ? new Date(date) : new Date(),
			transactionId,
		});

		res.status(201).json({ success: true, transaction });
	} catch (err) {
		console.error("CreateTransaction error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Update a transaction
export const updateTransaction = async (req, res) => {
	try {
		const { id } = req.params;
		const { amount, type, description, categoryId, date } = req.body;

		const transaction = await Transaction.findOne({
			_id: id,
			userId: req.user._id,
		});
		if (!transaction)
			return res.status(404).json({ error: "Transaction not found" });

		if (categoryId) {
			const category = await Category.findOne({
				_id: categoryId,
				userId: req.user._id,
			});
			if (!category)
				return res.status(400).json({ error: "Invalid category selected" });
			transaction.categoryId = category._id;
			transaction.categoryName = category.name;
		}

		if (amount) transaction.amount = amount;
		if (type) transaction.type = type;
		if (description) transaction.description = description;
		if (date) transaction.date = date;

		await transaction.save();

		res.status(200).json({ success: true, transaction });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Delete a transaction
export const deleteTransaction = async (req, res) => {
	try {
		const { id } = req.params;

		const transaction = await Transaction.findOneAndDelete({
			_id: id,
			userId: req.user._id,
		});
		if (!transaction)
			return res.status(404).json({ error: "Transaction not found" });

		res.status(200).json({ success: true, message: "Transaction deleted" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const getLinkedTransactions = async (req, res) => {
	try {
		const transactions = await Transaction.find({
			userId: req.user._id,
			source: "bank",
		}).sort({ date: -1 });

		res.status(200).json({
			success: true,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const getUnbudgetedTransactions = async (req, res) => {
	try {
		const transactions = await Transaction.find({
			userId: req.user._id,
			source: "bank",
			budgetId: { $exists: false },
		});

		res.status(200).json({
			success: true,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const getBudgetTransactions = async (req, res) => {
	try {
		const transactions = await Transaction.find({
			userId: req.user._id,
			budgetId: { $exists: true },
		});

		res.status(200).json({
			success: true,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const getTransactionById = async (req, res) => {
	try {
		const { id } = req.params;

		const transaction = await Transaction.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!transaction) {
			return res.status(404).json({
				error: "Transaction not found",
			});
		}

		res.status(200).json({
			success: true,
			transaction,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const linkTransactionToBudget = async (req, res) => {
	try {
		const { transactionId, budgetId } = req.body;

		const transaction = await Transaction.findOne({
			_id: transactionId,
			userId: req.user._id,
		});

		if (!transaction) {
			return res.status(404).json({
				error: "Transaction not found",
			});
		}

		const budget = await Budget.findOne({
			_id: budgetId,
			userId: req.user._id,
		});

		if (!budget) {
			return res.status(404).json({
				error: "Budget not found",
			});
		}

		transaction.budgetId = budget._id;

		await transaction.save();

		res.status(200).json({
			success: true,
			transaction,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const getTransactionHistory = async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;

		const transactions = await Transaction.find({
			userId: req.user._id,
		})
			.sort({ date: -1 })
			.skip((page - 1) * limit)
			.limit(Number(limit));

		res.status(200).json({
			success: true,
			page,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const pullMonoTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;

		const connection = await BankConnection.findOne({
			monoAccountId: accountId,
		});
		if (!connection) {
			return res
				.status(404)
				.json({ success: false, error: "Bank account not found" });
		}

		const response = await mono.get(`/accounts/${accountId}/transactions`);
		const transactions = response.data.data;

		for (const tx of transactions) {
			await Transaction.updateOne(
				{ transactionId: tx._id },
				{
					userId: connection.userId,
					bankConnectionId: connection._id,
					amount: tx.amount,
					description: tx.narration,
					type: tx.type === "debit" ? "expense" : "income",
					date: tx.date,
					source: "bank",
				},
				{ upsert: true },
			);
		}

		res.json({ success: true, count: transactions.length });
	} catch (err) {
		console.error(
			"Error pulling Mono transactions:",
			err.response?.data || err.message,
		);
		res.status(500).json({ success: false, error: err.message });
	}
};
