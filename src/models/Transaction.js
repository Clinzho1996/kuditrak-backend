// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	bankConnectionId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "BankConnection",
	},
	transactionId: {
		type: String,
		unique: true,
		sparse: true, // only applies uniqueness to documents that have a value
	},
	amount: Number,
	type: { type: String, enum: ["income", "expense"], required: true },
	description: String,
	categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
	categoryName: String,
	source: { type: String, enum: ["bank", "manual"], default: "manual" },
	budgetId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Budget",
	},
	date: Date,
	createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Transaction", transactionSchema);
