import BankConnection from "../models/BankConnection.js";
import Budget from "../models/Budget.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import mono from "../services/monoService.js";
import { sendTransactionNotification } from "../services/notificationService.js";
import { checkLimits } from "../services/subscriptionService.js";

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

export const createTransaction = async (req, res) => {
	try {
		const { amount, type, description, categoryId, date } = req.body;

		console.log("=== CREATE TRANSACTION CONTROLLER ===");
		console.log("Request body:", req.body);
		console.log("User ID:", req.user?._id);

		// Validate required fields
		if (!amount || !type) {
			console.log("Missing required fields");
			return res.status(400).json({ error: "Amount and type are required" });
		}

		if (!["income", "expense"].includes(type)) {
			console.log("Invalid type:", type);
			return res.status(400).json({ error: "Invalid transaction type" });
		}

		// Check user
		if (!req.user || !req.user._id) {
			console.log("No user found");
			return res.status(401).json({ error: "Unauthorized: user missing" });
		}

		// Check limits
		try {
			await checkLimits(req.user._id, "manual_transaction");
		} catch (limitError) {
			console.log("Limit check failed:", limitError.message);
			return res.status(403).json({ error: limitError.message });
		}

		// Get category
		let categoryName = null;
		if (categoryId) {
			console.log("Looking for category:", categoryId);
			const category = await Category.findOne({
				_id: categoryId,
				userId: req.user._id,
			});

			if (!category) {
				console.log("Category not found:", categoryId);
				return res.status(400).json({ error: "Invalid category selected" });
			}

			categoryName = category.name;
			console.log("Found category:", categoryName);
		}

		// Create transaction
		const transactionId = `TRX-${req.user._id}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

		console.log("Creating transaction with data:", {
			userId: req.user._id,
			amount: Number(amount),
			type,
			description,
			categoryId,
			categoryName,
			date: date ? new Date(date) : new Date(),
			transactionId,
		});

		const transaction = await Transaction.create({
			userId: req.user._id,
			amount: Number(amount),
			type,
			description: description || "",
			categoryId: categoryId || null,
			categoryName,
			source: "manual",
			date: date ? new Date(date) : new Date(),
			transactionId,
		});

		const wallet = await Wallet.findOne({ userId: req.user._id });

		await sendTransactionNotification(
			req.user._id,
			amount,
			wallet?.balance || 0,
			type,
		);
		console.log("Transaction created successfully:", transaction._id);

		res.status(201).json({ success: true, transaction });
	} catch (err) {
		console.error("CreateTransaction error:", err);
		console.error("Error stack:", err.stack);
		res.status(500).json({
			error: err.message,
			details: process.env.NODE_ENV === "development" ? err.stack : undefined,
		});
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

		// Store old values to revert budget spent if needed
		const oldAmount = transaction.amount;
		const oldBudgetId = transaction.budgetId;
		let newBudgetId = transaction.budgetId;

		// Handle category change and potential budget update
		if (categoryId) {
			const category = await Category.findOne({
				_id: categoryId,
				userId: req.user._id,
			});
			if (!category)
				return res.status(400).json({ error: "Invalid category selected" });

			transaction.categoryId = category._id;
			transaction.categoryName = category.name;

			// Try to find matching budget for expense transactions
			if (type === "expense" && !transaction.budgetId) {
				const budgets = await Budget.find({
					userId: req.user._id,
					startDate: { $lte: new Date() },
					endDate: { $gte: new Date() },
				});

				const matchingBudget = budgets.find(
					(budget) =>
						budget.name.toLowerCase().includes(category.name.toLowerCase()) ||
						category.name.toLowerCase().includes(budget.name.toLowerCase()),
				);

				if (matchingBudget) {
					newBudgetId = matchingBudget._id;
				}
			}
		}

		// Update budget spent if amount or budget changed
		if (
			oldBudgetId &&
			(oldAmount !== Number(amount) || newBudgetId !== oldBudgetId)
		) {
			const oldBudget = await Budget.findOne({
				_id: oldBudgetId,
				userId: req.user._id,
			});
			if (oldBudget) {
				oldBudget.spent = Math.max(0, (oldBudget.spent || 0) - oldAmount);
				await oldBudget.save();
			}
		}

		if (newBudgetId && newBudgetId !== oldBudgetId) {
			const newBudget = await Budget.findOne({
				_id: newBudgetId,
				userId: req.user._id,
			});
			if (newBudget) {
				newBudget.spent = (newBudget.spent || 0) + Number(amount);
				await newBudget.save();
			}
		} else if (newBudgetId && oldAmount !== Number(amount)) {
			const budget = await Budget.findOne({
				_id: newBudgetId,
				userId: req.user._id,
			});
			if (budget) {
				budget.spent = (budget.spent || 0) - oldAmount + Number(amount);
				await budget.save();
			}
		}

		// Update transaction fields
		if (amount) transaction.amount = Number(amount);
		if (type) transaction.type = type;
		if (description) transaction.description = description;
		if (date) transaction.date = date;
		if (newBudgetId) transaction.budgetId = newBudgetId;

		await transaction.save();

		res.status(200).json({ success: true, transaction });
	} catch (err) {
		console.error("Update transaction error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Delete a transaction
export const deleteTransaction = async (req, res) => {
	try {
		const { id } = req.params;

		const transaction = await Transaction.findOne({
			_id: id,
			userId: req.user._id,
		});
		if (!transaction)
			return res.status(404).json({ error: "Transaction not found" });

		// Revert budget spent if transaction was linked to a budget
		if (transaction.budgetId) {
			const budget = await Budget.findOne({
				_id: transaction.budgetId,
				userId: req.user._id,
			});
			if (budget) {
				budget.spent = Math.max(0, (budget.spent || 0) - transaction.amount);
				await budget.save();
			}
		}

		await Transaction.findByIdAndDelete(id);

		res.status(200).json({ success: true, message: "Transaction deleted" });
	} catch (err) {
		console.error("Delete transaction error:", err);
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
			budgetId: { $exists: false, $eq: null },
		}).sort({ date: -1 });

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
			budgetId: { $exists: true, $ne: null },
		}).sort({ date: -1 });

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

		// Only allow expense transactions to be linked to budgets
		if (transaction.type !== "expense") {
			return res.status(400).json({
				error: "Only expense transactions can be linked to budgets",
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

		// If transaction is already linked to a budget, revert the old budget's spent
		if (transaction.budgetId && transaction.budgetId.toString() !== budgetId) {
			const oldBudget = await Budget.findOne({
				_id: transaction.budgetId,
				userId: req.user._id,
			});
			if (oldBudget) {
				oldBudget.spent = Math.max(
					0,
					(oldBudget.spent || 0) - transaction.amount,
				);
				await oldBudget.save();
			}
		}

		// Update budget spent
		budget.spent = (budget.spent || 0) + transaction.amount;
		await budget.save();

		// Link transaction to budget
		transaction.budgetId = budget._id;
		await transaction.save();

		res.status(200).json({
			success: true,
			transaction,
			budget,
		});
	} catch (err) {
		console.error("Link transaction to budget error:", err);
		res.status(500).json({ error: err.message });
	}
};

export const getTransactionHistory = async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;
		const skip = (parseInt(page) - 1) * parseInt(limit);

		const transactions = await Transaction.find({
			userId: req.user._id,
		})
			.sort({ date: -1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Transaction.countDocuments({ userId: req.user._id });
		const totalPages = Math.ceil(total / parseInt(limit));

		res.status(200).json({
			success: true,
			page: parseInt(page),
			totalPages,
			total,
			transactions,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Fixed Mono Transactions Pull
export const pullMonoTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;
		const { page = 1, perPage = 50 } = req.query;

		console.log("Pulling transactions for account:", accountId);
		console.log(`Page: ${page}, Per Page: ${perPage}`);

		// Find the bank connection - try both fields
		let connection = await BankConnection.findOne({
			$or: [
				{ monoAccountId: accountId },
				{ _id: accountId },
				{ accountId: accountId },
			],
		});

		if (!connection) {
			return res.status(404).json({
				success: false,
				error: "Bank account not found",
				details: `No connection found for accountId: ${accountId}`,
			});
		}

		console.log("Found connection:", connection._id);

		// Check if Mono client is initialized
		if (!mono) {
			return res.status(500).json({
				success: false,
				error: "Mono service not initialized",
			});
		}

		// Fetch transactions from Mono with pagination
		const response = await mono.get(
			`/accounts/${connection.monoAccountId}/transactions?page=${page}&perPage=${perPage}`,
		);

		if (!response.data) {
			return res.status(500).json({
				success: false,
				error: "Invalid response from Mono API",
			});
		}

		const transactions = response.data.data || [];
		const meta = response.data.meta || {};

		console.log(`Found ${transactions?.length || 0} transactions`);
		console.log(
			`Total: ${meta?.total}, Page: ${meta?.page || page}/${Math.ceil((meta?.total || 0) / perPage)}`,
		);

		let savedCount = 0;
		let updatedCount = 0;

		// Process and save transactions
		for (const tx of transactions) {
			// Skip if no transaction ID
			if (!tx.id) continue;

			const transactionData = {
				userId: connection.userId,
				bankConnectionId: connection._id,
				transactionId: tx.id,
				amount: Math.abs(tx.amount),
				description: tx.narration || tx.description || "Mono Transaction",
				type: tx.type === "debit" ? "expense" : "income",
				date: tx.date ? new Date(tx.date) : new Date(),
				source: "bank",
				status: "Completed",
				currency: tx.currency || "NGN",
				balance: tx.balance,
				category: tx.category,
				metadata: {
					monoId: tx.id,
					originalType: tx.type,
					narration: tx.narration,
				},
			};

			// Use updateOne with upsert to avoid duplicates
			const result = await Transaction.updateOne(
				{
					transactionId: tx.id,
					userId: connection.userId,
				},
				{ $set: transactionData },
				{ upsert: true },
			);

			if (result.upsertedCount > 0) {
				savedCount++;
			} else if (result.modifiedCount > 0) {
				updatedCount++;
			}
		}

		// Update last sync time
		connection.lastSync = new Date();
		await connection.save();

		res.json({
			success: true,
			page: parseInt(page),
			total: meta?.total || 0,
			count: transactions.length,
			saved: savedCount,
			updated: updatedCount,
			hasNext: !!meta?.next,
			nextPage: meta?.next ? parseInt(page) + 1 : null,
			transactions: transactions,
		});
	} catch (err) {
		console.error("Error pulling Mono transactions:", err);
		console.error("Error details:", err.response?.data || err.message);

		res.status(500).json({
			success: false,
			error: err.message,
			details: err.response?.data || "Internal server error",
		});
	}
};

// Add endpoint to fetch all transactions (handles pagination automatically)
export const pullAllMonoTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;

		const connection = await BankConnection.findOne({
			$or: [
				{ monoAccountId: accountId },
				{ _id: accountId },
				{ accountId: accountId },
			],
		});

		if (!connection) {
			return res
				.status(404)
				.json({ success: false, error: "Bank account not found" });
		}

		let allTransactions = [];
		let page = 1;
		let hasMore = true;
		const perPage = 50;

		while (hasMore) {
			console.log(`Fetching page ${page}...`);

			try {
				const response = await mono.get(
					`/accounts/${connection.monoAccountId}/transactions?page=${page}&perPage=${perPage}`,
				);

				const transactions = response.data.data;
				const meta = response.data.meta;

				if (transactions && transactions.length > 0) {
					allTransactions = [...allTransactions, ...transactions];
				}

				hasMore =
					!!meta?.next && transactions && transactions.length === perPage;
				page++;
			} catch (error) {
				console.error(`Error fetching page ${page}:`, error.message);
				break;
			}
		}

		console.log(`Total transactions fetched: ${allTransactions.length}`);

		let savedCount = 0;
		let updatedCount = 0;

		// Save all transactions
		for (const tx of allTransactions) {
			const result = await Transaction.updateOne(
				{
					transactionId: tx.id,
					userId: connection.userId,
				},
				{
					$set: {
						userId: connection.userId,
						bankConnectionId: connection._id,
						transactionId: tx.id,
						amount: Math.abs(tx.amount),
						description: tx.narration || tx.description || "Mono Transaction",
						type: tx.type === "debit" ? "expense" : "income",
						date: tx.date ? new Date(tx.date) : new Date(),
						source: "bank",
						status: "Completed",
						currency: tx.currency || "NGN",
						balance: tx.balance,
						category: tx.category,
						metadata: {
							monoId: tx.id,
							originalType: tx.type,
							narration: tx.narration,
						},
					},
				},
				{ upsert: true },
			);

			if (result.upsertedCount > 0) {
				savedCount++;
			} else if (result.modifiedCount > 0) {
				updatedCount++;
			}
		}

		connection.lastSync = new Date();
		await connection.save();

		res.json({
			success: true,
			total: allTransactions.length,
			saved: savedCount,
			updated: updatedCount,
			message: `Synced ${allTransactions.length} transactions`,
		});
	} catch (err) {
		console.error("Error pulling all Mono transactions:", err.message);
		res.status(500).json({
			success: false,
			error: err.message,
		});
	}
};

// Get all bank transactions with pagination
export const getAllBankTransactions = async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;
		const skip = (parseInt(page) - 1) * parseInt(limit);

		const transactions = await Transaction.find({
			userId: req.user._id,
			source: "bank",
		})
			.sort({ date: -1 })
			.skip(skip)
			.limit(parseInt(limit));

		const total = await Transaction.countDocuments({
			userId: req.user._id,
			source: "bank",
		});

		res.status(200).json({
			success: true,
			page: parseInt(page),
			total,
			hasNext: skip + transactions.length < total,
			transactions,
		});
	} catch (err) {
		console.error("Get all bank transactions error:", err);
		res.status(500).json({ error: err.message });
	}
};

// Sync bank transactions (force pull)
export const syncBankTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;

		// Call pull function with page 1
		const result = await pullMonoTransactions(req, res);

		return result;
	} catch (err) {
		console.error("Sync bank transactions error:", err);
		res.status(500).json({ error: err.message });
	}
};
