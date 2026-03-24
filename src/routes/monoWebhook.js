// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body;

		if (!data) {
			console.log("Webhook received without data");
			return res
				.status(200)
				.json({ success: true, message: "No data in webhook" });
		}

		// Support both event types
		let customer, account;

		if (type === "ACCOUNT_LINKED") {
			({ customer, account } = data);
		} else if (type === "mono.events.account_updated") {
			customer = data.data?.customer;
			account = data.data?.account;
		} else {
			return res
				.status(200)
				.json({ success: true, message: "Webhook type ignored" });
		}

		if (!customer || !account) {
			console.log("Webhook missing customer or account info", type, data);
			return res
				.status(200)
				.json({ success: true, message: "Missing customer/account info" });
		}

		// Find user by monoCustomerId
		const user = await User.findOne({ monoCustomerId: customer.id });

		if (!user) {
			console.log(`User not found for monoCustomerId: ${customer.id}`);
			// Always return 200 to Mono to avoid retries/circuit open
			return res.status(200).json({
				success: true,
				message:
					"User not found for this Mono customer ID. Manual association may be needed.",
			});
		}

		// Upsert bank connection
		const connection = await BankConnection.findOneAndUpdate(
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

		console.log(
			`Account saved/updated for user ${user.email}: ${connection.accountNumber}`,
		);

		res.status(200).json({
			success: true,
			message: "Webhook processed successfully",
			connection,
		});
	} catch (err) {
		console.error("Webhook processing error:", err.message, err.stack);
		// Never return non-200 to Mono; log error internally
		res.status(200).json({
			success: true,
			message: "Webhook processed with internal error",
		});
	}
});

export default router;
