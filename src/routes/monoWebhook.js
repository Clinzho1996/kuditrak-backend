// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body;

		if (!data || !data.data) {
			return res
				.status(400)
				.json({ success: false, message: "No data provided" });
		}

		const payload = data.data;

		// For new accounts / initial link
		if (type === "ACCOUNT_LINKED" || type === "mono.events.account_connected") {
			const accountId = payload.id;
			const customerId = payload.customer;

			if (!accountId || !customerId) {
				return res
					.status(400)
					.json({ success: false, message: "Missing accountId or customerId" });
			}

			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("User not found for Mono customer ID:", customerId);
				return res.status(404).json({
					success: false,
					message: "User not found. Manual association needed.",
				});
			}

			// Upsert placeholder BankConnection
			const connection = await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true },
			);

			console.log(
				"BankConnection created/updated for account_connected:",
				accountId,
			);
			return res
				.status(200)
				.json({
					success: true,
					message: "Account linked/connected successfully",
					connection,
				});
		}

		// For account updates with full account info
		if (type === "mono.events.account_updated") {
			const account = payload.account;
			if (!account) {
				return res
					.status(400)
					.json({ success: false, message: "No account info in payload" });
			}

			// Find existing BankConnection by monoAccountId
			let connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});

			// If not found, try matching by monoCustomerId (in case webhook was missed before)
			if (!connection && payload.customer) {
				connection = await BankConnection.findOne({
					monoCustomerId: payload.customer,
				});
			}

			if (!connection) {
				console.log(
					"BankConnection not found for account_updated:",
					account._id,
				);
				return res
					.status(404)
					.json({ success: false, message: "BankConnection not found" });
			}

			// Update full account details
			connection.accountName = account.name;
			connection.accountNumber =
				account.accountNumber || account.account_number;
			connection.bankName = account.institution?.name;
			connection.balance = account.balance;
			connection.currency = account.currency;
			connection.lastSync = new Date();

			await connection.save();
			console.log("BankConnection updated for account_updated:", account._id);

			return res
				.status(200)
				.json({
					success: true,
					message: "BankConnection updated successfully",
					connection,
				});
		}

		// All other events
		res.status(200).json({ success: true, message: "Webhook received" });
	} catch (err) {
		console.error("Webhook error:", err);
		res.status(500).json({ success: false, error: err.message });
	}
});

export default router;
