// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import Transaction from "../models/Transaction.js";
import { pushBudgetAlerts } from "../services/analyticsService.js";

const router = express.Router();

// Mono webhook endpoint
router.post("/mono/webhook", async (req, res) => {
	try {
		console.log("Raw body type:", typeof req.body); // should be 'object'
		console.log("Raw body:", req.body);

		const event = req.body.event || req.body.type || req.body.payload;
		if (!event || !event.data) {
			return res.status(400).json({ error: "Invalid Mono webhook payload" });
		}

		const eventType = event.event;
		console.log("Mono webhook event:", eventType);

		// 1. Handle account_connected
		if (eventType === "mono.events.account_connected") {
			const accData = event.data;
			await BankConnection.updateOne(
				{ monoAccountId: accData.id },
				{
					userId: accData.userId,
					monoCustomerId: accData._id,
					status: "Connected",
				},
				{ upsert: true },
			);
			console.log("Account connected:", accData.id);
		}

		// 2. Handle account_updated
		else if (eventType === "mono.events.account_updated") {
			const acc = event.data.account;
			await BankConnection.updateOne(
				{ monoAccountId: acc._id },
				{
					accountName: acc.name,
					accountNumber: acc.accountNumber,
					bankName: acc.institution?.name || "Unknown",
					balance: acc.balance,
					currency: acc.currency,
					type: acc.type,
					status: "Active",
				},
				{ upsert: true },
			);
			console.log("Account updated:", acc._id);
		}

		// 3. Handle new transactions
		else if (eventType === "transactions.created") {
			const txData = event.data;
			const connection = await BankConnection.findOne({
				monoAccountId: txData.account_id,
				status: "Active",
			});

			if (!connection) {
				console.warn(
					"Mono transaction received but no active connection found",
				);
				return res.status(200).json({ success: true });
			}

			await Transaction.updateOne(
				{ transactionId: txData._id },
				{
					userId: connection.userId,
					bankConnectionId: connection._id,
					transactionId: txData._id,
					amount: txData.amount,
					description: txData.narration,
					type: txData.type === "debit" ? "expense" : "income",
					date: txData.date,
					source: "bank",
				},
				{ upsert: true },
			);

			if (connection.pushToken) {
				const user = {
					_id: connection.userId,
					pushToken: connection.pushToken,
				};
				await pushBudgetAlerts(user);
			} else {
				console.log("No push token found for user", connection.userId);
			}

			console.log("Mono transaction processed for user:", connection.userId);
		}

		// Ignore other events
		else {
			console.log("Ignoring event type:", eventType);
		}

		res.status(200).json({ success: true });
	} catch (err) {
		console.error("Error handling Mono webhook:", err.message);
		res.status(500).json({ error: err.message });
	}
});

export default router;
