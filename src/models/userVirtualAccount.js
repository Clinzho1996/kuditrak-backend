// models/UserVirtualAccount.js
import mongoose from "mongoose";

const userVirtualAccountSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	accountNumber: { type: String, required: true, unique: true },
	bankName: { type: String, required: true },
	accountName: { type: String, required: true },
	provider: {
		type: String,
		enum: ["paystack-titan", "wema"],
		default: "paystack-titan",
	},
	customerCode: { type: String },
	isActive: { type: Boolean, default: true },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

userVirtualAccountSchema.index({ userId: 1 });
userVirtualAccountSchema.index({ accountNumber: 1 });

export default mongoose.model("UserVirtualAccount", userVirtualAccountSchema);
