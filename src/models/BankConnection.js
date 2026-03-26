// models/BankConnection.js
import mongoose from "mongoose";

const bankConnectionSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		provider: {
			type: String,
			default: "mono",
		},

		accountName: {
			type: String,
			required: true,
		},
		accountNumber: {
			type: String,
			required: true,
		},
		bankName: {
			type: String,
			required: true,
		},
		bankCode: {
			type: String, // Paystack bank code for the bank
			default: null,
		},

		monoCustomerId: String,
		monoAccountId: {
			type: String,
			unique: true,
			sparse: true, // Allow null values
		},

		// Paystack recipient code for withdrawals
		recipientCode: {
			type: String,
			default: null,
			index: true, // Index for faster lookups
		},

		balance: {
			type: Number,
			default: 0,
		},
		currency: {
			type: String,
			default: "NGN",
		},

		status: {
			type: String,
			enum: ["Active", "Inactive", "Processing", "Pending"],
			default: "Active",
		},

		lastSync: {
			type: Date,
			default: null,
		},

		// Track when recipient was created
		recipientCreatedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true, // Adds createdAt and updatedAt automatically
	},
);

// Add indexes for common queries
bankConnectionSchema.index({ userId: 1, status: 1 });
bankConnectionSchema.index({ monoAccountId: 1 });
bankConnectionSchema.index({ recipientCode: 1 });

export default mongoose.model("BankConnection", bankConnectionSchema);
