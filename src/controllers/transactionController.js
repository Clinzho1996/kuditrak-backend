import BankConnection from "../models/BankConnection.js";
import Budget from "../models/Budget.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import mono, { pullTransactionsFromMono } from "../services/monoService.js";
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

// Fixed pullMonoTransactions using the mono service
export const pullMonoTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;
		const { page = 1, perPage = 50 } = req.query;

		console.log("========================================");
		console.log("🔵 MONO PULL TRANSACTIONS STARTED");
		console.log("========================================");
		console.log(`📋 Account ID: ${accountId}`);
		console.log(`📄 Page: ${page}, Per Page: ${perPage}`);

		// Find the bank connection
		const connection = await BankConnection.findOne({
			$or: [
				{ monoAccountId: accountId },
				{ _id: accountId },
				{ accountId: accountId },
			],
		}).populate("userId", "email name");

		if (!connection) {
			console.log("❌ Bank connection not found for accountId:", accountId);
			return res.status(404).json({
				success: false,
				error: "Bank account not found",
				details: `No connection found for accountId: ${accountId}`,
			});
		}

		console.log("✅ Found connection:");
		console.log(`   - ID: ${connection._id}`);
		console.log(`   - User: ${connection.userId?.email || "Unknown"}`);
		console.log(`   - Mono Account ID: ${connection.monoAccountId}`);
		console.log(`   - Last Sync: ${connection.lastSync || "Never"}`);

		// Fetch transactions from Mono using the service
		try {
			// Build URL
			const url = `/accounts/${connection.monoAccountId}/transactions`;
			const params = {
				page: parseInt(page),
				perPage: parseInt(perPage),
			};

			console.log(`🌐 Calling Mono API: ${url} with params:`, params);

			const response = await mono.get(url, { params });

			const transactions = response.data.data || [];
			const meta = response.data.meta || {};

			console.log(`📊 Mono Response Stats:`);
			console.log(`   - Total Transactions: ${meta.total || 0}`);
			console.log(`   - Current Page: ${meta.page || page}`);
			console.log(`   - Transactions in this page: ${transactions.length}`);
			console.log(`   - Has Next: ${!!meta.next}`);

			let savedCount = 0;
			let updatedCount = 0;

			// Process and save transactions
			for (const tx of transactions) {
				if (!tx.id && !tx._id) {
					console.log(`⚠️ Skipping transaction with no ID:`, tx);
					continue;
				}

				// Determine transaction type
				let type = "expense";
				if (tx.type === "credit" || tx.type === "income" || tx.amount > 0) {
					type = "income";
				} else if (tx.type === "debit" || tx.amount < 0) {
					type = "expense";
				}

				const transactionData = {
					userId: connection.userId._id || connection.userId,
					bankConnectionId: connection._id,
					transactionId: tx.id || tx._id,
					amount: Math.abs(tx.amount),
					type: type,
					description: tx.narration || tx.description || "Mono Transaction",
					categoryId: null,
					categoryName: tx.category || null,
					source: "bank",
					date: tx.date ? new Date(tx.date) : new Date(),
					status: "Completed",
					currency: tx.currency || "NGN",
					balance: tx.balance,
					metadata: {
						monoId: tx.id || tx._id,
						originalType: tx.type,
						narration: tx.narration,
					},
				};

				// Check if transaction already exists
				const existingTransaction = await Transaction.findOne({
					transactionId: tx.id || tx._id,
					userId: connection.userId._id || connection.userId,
				});

				if (existingTransaction) {
					const result = await Transaction.updateOne(
						{
							transactionId: tx.id || tx._id,
							userId: connection.userId._id || connection.userId,
						},
						{ $set: transactionData },
					);
					if (result.modifiedCount > 0) updatedCount++;
				} else {
					await Transaction.create(transactionData);
					savedCount++;
				}
			}

			// Update last sync time
			connection.lastSync = new Date();
			await connection.save();

			console.log(`\n📈 Sync Summary:`);
			console.log(`   - New Transactions: ${savedCount}`);
			console.log(`   - Updated Transactions: ${updatedCount}`);
			console.log(`   - Total Processed: ${transactions.length}`);
			console.log(`\n✅ MONO PULL COMPLETED SUCCESSFULLY`);
			console.log("========================================\n");

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
				syncTime: new Date().toISOString(),
				connectionInfo: {
					bankName: connection.bankName,
					lastSync: connection.lastSync,
				},
			});
		} catch (monoError) {
			console.error("❌ Mono API Error:");
			console.error(`   Status: ${monoError.response?.status}`);
			console.error(`   Data:`, monoError.response?.data);
			console.error(`   Message: ${monoError.message}`);

			throw monoError;
		}
	} catch (err) {
		console.error("❌ ERROR pulling Mono transactions:");
		console.error("Error message:", err.message);
		console.error("Error stack:", err.stack);

		res.status(500).json({
			success: false,
			error: err.message,
			details: err.response?.data || "Internal server error",
			timestamp: new Date().toISOString(),
		});
	}
};

// New function to pull all transactions (using the service)
export const pullAllMonoTransactions = async (req, res) => {
	try {
		const { accountId } = req.params;

		const connection = await BankConnection.findOne({
			$or: [{ monoAccountId: accountId }, { _id: accountId }],
		});

		if (!connection) {
			return res.status(404).json({
				success: false,
				error: "Bank account not found",
			});
		}

		// Use the pullTransactionsFromMono service
		const since =
			connection.lastSync || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days if never synced
		const result = await pullTransactionsFromMono(connection, since);

		res.json({
			success: true,
			...result,
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
