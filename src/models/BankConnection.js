// models/BankConnection.js
import mongoose from "mongoose";

const bankConnectionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	provider: String,
	accountName: String,
	accountNumber: String,
	bankName: String,
	monoCustomerId: String, // <-- Store Mono customer ID
	monoAccountId: String, // <-- Optional: Mono account ID
	status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
	lastSync: Date,
});

export default mongoose.model("BankConnection", bankConnectionSchema);
