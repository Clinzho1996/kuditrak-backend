// models/BankConnection.js
import mongoose from "mongoose";

const bankConnectionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	provider: { type: String, default: "mono" },

	accountName: String,
	accountNumber: String,
	bankName: String,

	monoCustomerId: String,
	monoAccountId: { type: String, unique: true }, // 🔥 CRITICAL

	balance: Number,
	currency: String,

	status: {
		type: String,
		enum: ["Active", "Inactive"],
		default: "Active",
	},

	lastSync: Date,
});

export default mongoose.model("BankConnection", bankConnectionSchema);
