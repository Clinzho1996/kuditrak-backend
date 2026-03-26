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
			required: true, // Keep required - we'll use placeholders
		},
		accountNumber: {
			type: String,
			required: true, // Keep required - we'll use placeholders
		},
		bankName: {
			type: String,
			required: true, // Keep required - we'll use placeholders
		},
		bankCode: {
			type: String,
			default: null,
		},

		monoCustomerId: String,
		monoAccountId: {
			type: String,
			unique: true,
			sparse: true,
		},

		recipientCode: {
			type: String,
			default: null,
			index: true,
		},

		balance: {
			type: Number,
			default: 0,
		},
		currency: {
			type: String,
			default: "NGN",
		},
		bvn: {
			type: String,
			default: null,
		},

		status: {
			type: String,
			enum: ["Active", "Inactive", "Processing", "Pending"],
			default: "Processing",
		},

		lastSync: {
			type: Date,
			default: null,
		},

		recipientCreatedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
	},
);

// Add indexes
bankConnectionSchema.index({ userId: 1, status: 1 });
bankConnectionSchema.index({ monoAccountId: 1 });
bankConnectionSchema.index({ recipientCode: 1 });

export default mongoose.model("BankConnection", bankConnectionSchema);
