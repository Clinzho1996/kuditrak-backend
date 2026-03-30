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
		sparse: true, // This creates the unique index - no need for separate index
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
			"wallet",
			"bank",
			"manual",
			"savings",
			"penalty",
			"card",
			"virtual_account",
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

// Indexes for faster queries - remove duplicate transactionId index since it's handled by unique:true
transactionSchema.index({ userId: 1, createdAt: -1 });
// REMOVED: transactionSchema.index({ transactionId: 1 }); // Already handled by unique:true
transactionSchema.index({ status: 1 });
transactionSchema.index({ source: 1 });
transactionSchema.index({ type: 1 });

// Pre-save middleware
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
