// config/subscriptionLimits.js

export const LIMITS = {
	free: {
		manualTransactions: 15,
		bankConnections: 0,
		budgets: 3,
	},
	basic: {
		manualTransactions: Infinity,
		bankConnections: 3,
		budgets: 10,
	},
	pro: {
		manualTransactions: Infinity,
		bankConnections: Infinity,
		budgets: Infinity,
	},
};
