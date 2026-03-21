import mongoose from "mongoose";

const savingsBucketSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	walletId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Wallet",
		required: true,
	},
	name: { type: String, required: true },
	targetAmount: { type: Number, default: 0, required: true },
	currentAmount: { type: Number, default: 0 },
	topUpSchedule: {
		frequency: {
			type: String,
			enum: ["none", "daily", "weekly", "bi-weekly", "monthly"],
			default: "none",
		},
		amount: { type: Number, default: 0 },
		autoSaveEnabled: { type: Boolean, default: false },
	},
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Index for faster queries
savingsBucketSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("SavingsBucket", savingsBucketSchema);
