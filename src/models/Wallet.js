import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	balance: { type: Number, default: 0 },
	allocated: { type: Number, default: 0 },
	available: { type: Number, default: 0 },
	currency: { type: String, default: "NGN" },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Wallet", walletSchema);
