// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body;

		// Immediately acknowledge Mono
		res.status(200).json({ success: true, message: "Webhook received" });

		// Process asynchronously
		if (type === "ACCOUNT_LINKED" || type === "mono.events.account_connected") {
			const { customer, account } = data.data || data;
			if (!customer || !account) return;

			const user = await User.findOne({ monoCustomerId: customer.id });
			if (!user) {
				console.log("User not found for Mono customer ID", customer.id);
				return;
			}

			await BankConnection.findOneAndUpdate(
				{ monoAccountId: account._id || account.id },
				{
					userId: user._id,
					monoCustomerId: customer.id,
					monoAccountId: account._id || account.id,
					accountName: account.name,
					accountNumber: account.accountNumber || account.account_number,
					bankName: account.institution?.name || "Unknown",
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true },
			);
			console.log("Bank connection updated for account:", account.name);
		}

		if (type === "mono.events.account_updated") {
			const { account } = data.data;
			const connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});
			if (!connection) return;

			connection.balance = account.balance;
			connection.lastSync = new Date();
			await connection.save();
			console.log("Bank account updated:", account.name);
		}
	} catch (err) {
		console.error("Webhook processing error:", err);
	}
});

export default router;
