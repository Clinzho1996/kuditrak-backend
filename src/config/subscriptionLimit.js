// config/subscriptionLimits.js

export const LIMITS = {
	free: {
		manualTransactions: 25,
		bankConnections: 0,
		budgets: 3,
	},
	basic: {
		manualTransactions: 100,
		bankConnections: 3,
		budgets: 10,
	},
	pro: {
		manualTransactions: Infinity,
		bankConnections: Infinity,
		budgets: Infinity,
	},
};
