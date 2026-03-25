// config/subscriptionLimits.js
export const LIMITS = {
	free: {
		manualTransactions: 20,
		bankConnections: 0,
		budgets: 3,
		savingBuckets: 3, // Added saving buckets limit
	},
	basic: {
		manualTransactions: 25,
		bankConnections: 3,
		budgets: 10,
		savingBuckets: 10, // Added saving buckets limit
	},
	pro: {
		manualTransactions: Infinity,
		bankConnections: Infinity,
		budgets: Infinity,
		savingBuckets: Infinity, // Added saving buckets limit
	},
};
