import Wallet from "../models/Wallet.js";
import { sendEmail } from "./emailService.js";
import { sendPush, sendPushToUser } from "./pushService.js";

export const sendWeeklyBudgetAlerts = async () => {
	const wallets = await Wallet.find().populate("userId");

	for (const wallet of wallets) {
		const user = wallet.userId;
		if (!user) continue;

		const message = `Hello ${user.fullName}, your available balance is ₦${wallet.available}. Check your budgets!`;
		if (user.pushToken)
			await sendPush(user.pushToken, "Weekly Budget Alert", message);
		await sendEmail({
			to: user.email,
			subject: "Weekly Budget Reminder",
			html: `<p>${message}</p>`,
		});
	}
};

// Map notification types to templates
const NOTIFICATION_TEMPLATES = {
	BUDGET_NEARING_LIMIT: {
		title: "⚠️ Budget Alert",
		body: "You've used {percentage}% of your {budgetName} budget. Only ₦{remaining} left!",
		type: "budget_warning",
	},
	BUDGET_LIMIT_REACHED: {
		title: "🚨 Budget Limit Reached",
		body: "You've reached your {budgetName} budget limit of ₦{amount}!",
		type: "budget_exceeded",
	},
	TRANSACTION_CREDIT: {
		title: "💰 Money Received",
		body: "₦{amount} has been added to your wallet. New balance: ₦{balance}",
		type: "transaction_credit",
	},
	TRANSACTION_DEBIT: {
		title: "💸 Money Sent",
		body: "₦{amount} has been deducted from your wallet. New balance: ₦{balance}",
		type: "transaction_debit",
	},
	SAVING_CREATED: {
		title: "🎯 New Saving Goal",
		body: "You created '{bucketName}' saving goal. Target: ₦{targetAmount}",
		type: "saving_created",
	},
	SAVING_UPDATED: {
		title: "📈 Saving Goal Updated",
		body: "Your '{bucketName}' goal is now at {progress}% (₦{currentAmount} / ₦{targetAmount})",
		type: "saving_updated",
	},
	SAVING_COMPLETED: {
		title: "🎉 Goal Achieved!",
		body: "Congratulations! You've reached your '{bucketName}' saving goal of ₦{targetAmount}!",
		type: "saving_completed",
	},
	SAVING_DELETED: {
		title: "🗑️ Saving Goal Removed",
		body: "Your '{bucketName}' saving goal has been deleted.",
		type: "saving_deleted",
	},
	WALLET_TOPUP_SUCCESS: {
		title: "💳 Wallet Top-up Successful",
		body: "₦{amount} added to your wallet. New balance: ₦{balance}",
		type: "topup_success",
	},
	WITHDRAWAL_SUCCESS: {
		title: "🏦 Withdrawal Successful",
		body: "₦{amount} withdrawn from your wallet. New balance: ₦{balance}",
		type: "withdrawal_success",
	},
	SUBSCRIPTION_EXPIRING: {
		title: "⚠️ Subscription Expiring Soon",
		body: "Your {plan} plan expires in {days} days. Renew to keep premium features!",
		type: "subscription_warning",
	},
	SUBSCRIPTION_RENEWED: {
		title: "✅ Subscription Renewed",
		body: "Your {plan} plan has been renewed. Next billing: {nextBillingDate}",
		type: "subscription_renewed",
	},
	INSUFFICIENT_BALANCE: {
		title: "⚠️ Low Balance Alert",
		body: "Your wallet balance (₦{balance}) is running low. Top up to avoid failed transactions!",
		type: "low_balance",
	},
};

// Helper to replace placeholders in template
const formatNotification = (template, data) => {
	let message = template.body;
	Object.keys(data).forEach((key) => {
		message = message.replace(`{${key}}`, data[key]);
	});
	return message;
};

// Send budget nearing limit notification
export const sendBudgetNearingLimitNotification = async (
	userId,
	budgetName,
	percentage,
	remaining,
	amount,
) => {
	const template = NOTIFICATION_TEMPLATES.BUDGET_NEARING_LIMIT;
	const body = formatNotification(template, {
		percentage,
		budgetName,
		remaining: remaining.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		budgetId: budgetId,
		percentage: percentage.toString(),
	});
};

// Send budget limit reached notification
export const sendBudgetLimitReachedNotification = async (
	userId,
	budgetName,
	amount,
) => {
	const template = NOTIFICATION_TEMPLATES.BUDGET_LIMIT_REACHED;
	const body = formatNotification(template, {
		budgetName,
		amount: amount.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		budgetName,
	});
};

// Send transaction notification
export const sendTransactionNotification = async (
	userId,
	amount,
	balance,
	type,
) => {
	const template =
		type === "credit"
			? NOTIFICATION_TEMPLATES.TRANSACTION_CREDIT
			: NOTIFICATION_TEMPLATES.TRANSACTION_DEBIT;
	const body = formatNotification(template, {
		amount: amount.toLocaleString(),
		balance: balance.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		amount: amount.toString(),
	});
};

// Send saving goal notification
export const sendSavingNotification = async (
	userId,
	bucketName,
	currentAmount,
	targetAmount,
	action,
) => {
	let template;
	if (action === "created") {
		template = NOTIFICATION_TEMPLATES.SAVING_CREATED;
		const body = formatNotification(template, {
			bucketName,
			targetAmount: targetAmount.toLocaleString(),
		});
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			bucketName,
		});
	} else if (action === "deleted") {
		template = NOTIFICATION_TEMPLATES.SAVING_DELETED;
		const body = formatNotification(template, { bucketName });
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			bucketName,
		});
	} else if (action === "completed") {
		template = NOTIFICATION_TEMPLATES.SAVING_COMPLETED;
		const body = formatNotification(template, {
			bucketName,
			targetAmount: targetAmount.toLocaleString(),
		});
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			bucketName,
		});
	} else {
		const progress = Math.round((currentAmount / targetAmount) * 100);
		template = NOTIFICATION_TEMPLATES.SAVING_UPDATED;
		const body = formatNotification(template, {
			bucketName,
			progress,
			currentAmount: currentAmount.toLocaleString(),
			targetAmount: targetAmount.toLocaleString(),
		});
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			bucketName,
			progress: progress.toString(),
		});
	}
};

// Send wallet top-up notification
export const sendTopUpNotification = async (userId, amount, balance) => {
	const template = NOTIFICATION_TEMPLATES.WALLET_TOPUP_SUCCESS;
	const body = formatNotification(template, {
		amount: amount.toLocaleString(),
		balance: balance.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		amount: amount.toString(),
	});
};

// Send withdrawal notification
export const sendWithdrawalNotification = async (userId, amount, balance) => {
	const template = NOTIFICATION_TEMPLATES.WITHDRAWAL_SUCCESS;
	const body = formatNotification(template, {
		amount: amount.toLocaleString(),
		balance: balance.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		amount: amount.toString(),
	});
};

// Send low balance notification
export const sendLowBalanceNotification = async (userId, balance) => {
	const template = NOTIFICATION_TEMPLATES.INSUFFICIENT_BALANCE;
	const body = formatNotification(template, {
		balance: balance.toLocaleString(),
	});

	await sendPushToUser(userId, template.title, body, {
		type: template.type,
		balance: balance.toString(),
	});
};

// Send subscription notification
export const sendSubscriptionNotification = async (
	userId,
	plan,
	daysLeft,
	action,
) => {
	let template;
	if (action === "expiring") {
		template = NOTIFICATION_TEMPLATES.SUBSCRIPTION_EXPIRING;
		const body = formatNotification(template, { plan, days: daysLeft });
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			plan,
			daysLeft: daysLeft.toString(),
		});
	} else if (action === "renewed") {
		template = NOTIFICATION_TEMPLATES.SUBSCRIPTION_RENEWED;
		const body = formatNotification(template, {
			plan,
			nextBillingDate: daysLeft,
		});
		await sendPushToUser(userId, template.title, body, {
			type: template.type,
			plan,
		});
	}
};
