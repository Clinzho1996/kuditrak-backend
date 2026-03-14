import Budget from "../models/Budget.js";
import Transaction from "../models/Transaction.js";

/*
|--------------------------------------------------------------------------
| Create Budget
|--------------------------------------------------------------------------
*/
export const createBudget = async (req, res) => {
	try {
		const { name, amount, frequency, startDate, endDate } = req.body;

		const budget = await Budget.create({
			userId: req.user._id,
			name,
			amount,
			frequency,
			startDate,
			endDate,
		});

		res.status(201).json({ success: true, budget });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Get All Budgets
|--------------------------------------------------------------------------
*/
export const getBudgets = async (req, res) => {
	try {
		const budgets = await Budget.find({ userId: req.user._id });

		res.status(200).json({
			success: true,
			count: budgets.length,
			budgets,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Get Budget By ID
|--------------------------------------------------------------------------
*/
export const getBudgetById = async (req, res) => {
	try {
		const { id } = req.params;

		const budget = await Budget.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!budget) {
			return res.status(404).json({ error: "Budget not found" });
		}

		res.status(200).json({
			success: true,
			budget,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Budget Insights
|--------------------------------------------------------------------------
*/
export const getBudgetInsights = async (req, res) => {
	try {
		const { id } = req.params;

		const budget = await Budget.findOne({
			_id: id,
			userId: req.user._id,
		});

		if (!budget) {
			return res.status(404).json({ error: "Budget not found" });
		}

		const startOfMonth = new Date(
			new Date().getFullYear(),
			new Date().getMonth(),
			1,
		);

		const transactions = await Transaction.find({
			userId: req.user._id,
			category: budget.name,
			type: "expense",
			createdAt: { $gte: startOfMonth },
		});

		const spent = transactions.reduce((sum, t) => sum + t.amount, 0);

		const remaining = budget.amount - spent;

		const percentageUsed = (spent / budget.amount) * 100;

		let status = "safe";

		if (percentageUsed > 90) status = "danger";
		else if (percentageUsed > 70) status = "warning";

		res.status(200).json({
			success: true,
			data: {
				budgetId: budget._id,
				name: budget.name,
				budgetAmount: budget.amount,
				spent,
				remaining,
				percentageUsed,
				status,
				transactionCount: transactions.length,
			},
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Update Budget
|--------------------------------------------------------------------------
*/
export const updateBudget = async (req, res) => {
	try {
		const { id } = req.params;

		const updated = await Budget.findOneAndUpdate(
			{ _id: id, userId: req.user._id },
			req.body,
			{ new: true },
		);

		if (!updated) {
			return res.status(404).json({ error: "Budget not found" });
		}

		res.status(200).json({
			success: true,
			budget: updated,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Delete Budget
|--------------------------------------------------------------------------
*/
export const deleteBudget = async (req, res) => {
	try {
		const { id } = req.params;

		const deleted = await Budget.findOneAndDelete({
			_id: id,
			userId: req.user._id,
		});

		if (!deleted) {
			return res.status(404).json({ error: "Budget not found" });
		}

		res.status(200).json({
			success: true,
			message: "Budget deleted",
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
