// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body;

		if (!data) {
			return res
				.status(400)
				.json({ success: false, message: "No data provided" });
		}

		// Handle new account link event
		if (type === "ACCOUNT_LINKED" || type === "mono.events.account_connected") {
			const accountId = data.data?.id || data.data?.account?.id;
			const customerId =
				data.data?.customer || data.data?.account?.customer?.id;

			if (!accountId || !customerId) {
				console.log("Missing accountId or customerId in payload", data);
				return res
					.status(400)
					.json({ success: false, message: "Missing accountId or customerId" });
			}

			// Find user by Mono customer ID
			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log("User not found for Mono customer ID", customerId);
				return res.status(404).json({
					success: false,
					message:
						"User not found for this Mono customer ID. Manual association may be needed.",
				});
			}

			// Upsert BankConnection with placeholder info
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
			return res.status(200).json({
				success: true,
				message: "Account linked/connected successfully",
				connection,
			});
		}

		// Handle account updated event to fill full details
		if (type === "mono.events.account_updated") {
			const account = data.data?.account;
			if (!account) {
				console.log("No account info in account_updated payload", data);
				return res
					.status(400)
					.json({ success: false, message: "No account data provided" });
			}

			const connection = await BankConnection.findOne({
				monoAccountId: account._id,
			});
			if (!connection) {
				console.log(
					"BankConnection not found for account_updated:",
					account._id,
				);
				return res
					.status(404)
					.json({ success: false, message: "BankConnection not found" });
			}

			// Update full details
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

		// Default response for other events
		res.status(200).json({ success: true, message: "Webhook received" });
	} catch (err) {
		console.error("Webhook error:", err);
		res.status(500).json({ success: false, error: err.message });
	}
});

export default router;
