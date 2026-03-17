// services/subscriptionService.js

import { LIMITS } from "../config/subscriptionLimit.js";
import BankConnection from "../models/BankConnection.js";
import Budget from "../models/Budget.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

export const checkLimits = async (userId, action) => {
	const user = await User.findById(userId);
	const plan = user.subscription?.plan || "free";

	const limits = LIMITS[plan];

	switch (action) {
		case "manual_transaction":
			const txCount = await Transaction.countDocuments({
				userId,
				source: "manual",
			});

			if (txCount >= limits.manualTransactions) {
				throw new Error("Manual transaction limit reached. Upgrade your plan.");
			}
			break;

		case "bank_connection":
			const bankCount = await BankConnection.countDocuments({ userId });

			if (bankCount >= limits.bankConnections) {
				throw new Error("Bank connection limit reached. Upgrade your plan.");
			}
			break;

		case "budget":
			const budgetCount = await Budget.countDocuments({ userId });

			if (budgetCount >= limits.budgets) {
				throw new Error("Budget limit reached. Upgrade your plan.");
			}
			break;

		default:
			break;
	}
};
