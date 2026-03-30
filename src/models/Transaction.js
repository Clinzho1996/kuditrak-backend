// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
	bankConnectionId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "BankConnection",
	},
	transactionId: {
		type: String,
		unique: true,
		sparse: true, // only applies uniqueness to documents that have a value
	},
	amount: { type: Number, required: true },
	type: { type: String, enum: ["income", "expense"], required: true },
	status: {
		type: String,
		enum: ["Pending", "Completed", "Failed"],
		default: "Pending",
	},
	description: { type: String, default: "" },
	categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
	categoryName: { type: String },
	source: {
		type: String,
		enum: [
			"wallet", // Internal wallet transfers
			"bank", // Bank transfers (withdrawals)
			"manual", // Manual entries
			"savings", // Savings bucket allocations
			"penalty", // Early withdrawal penalties
			"card", // Card payments (standard Paystack)
			"virtual_account", // DVA bank transfers
		],
		default: "manual",
	},
	budgetId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Budget",
	},
	date: { type: Date, default: Date.now },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },

	// Payment specific fields
	paystackFee: { type: Number, default: 0 },
	totalCharged: { type: Number, default: 0 },
	paymentMethod: {
		type: String,
		enum: ["card", "bank_transfer", "virtual_account", "ussd", "qr"],
		default: null,
	},

	// Metadata for additional info
	metadata: {
		type: mongoose.Schema.Types.Mixed,
		default: {},
	},
});

// Indexes for faster queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ source: 1 });
transactionSchema.index({ type: 1 });

// Pre-save middleware to set date if not provided
transactionSchema.pre("save", function (next) {
	if (!this.date) {
		this.date = new Date();
	}
	if (!this.createdAt) {
		this.createdAt = new Date();
	}
	this.updatedAt = new Date();
	next();
});

export default mongoose.model("Transaction", transactionSchema);
