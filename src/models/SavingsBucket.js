import mongoose from "mongoose";

const savingsBucketSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	walletId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Wallet",
		required: true,
	},
	name: { type: String, required: true },
	targetAmount: { type: Number, default: 0 },
	currentAmount: { type: Number, default: 0 },
	topUpSchedule: {
		frequency: String,
		amount: Number,
	},
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("SavingsBucket", savingsBucketSchema);
