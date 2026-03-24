// routes/monoWebhook.js
import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const { type, data } = req.body;

		if (type === "ACCOUNT_LINKED") {
			const { customer, account } = data;

			// Find the user by monoCustomerId (or update if first time)
			let user = await User.findOne({ monoCustomerId: customer.id });
			if (!user) {
				// if first time linking, you may find by email / prompt user to provide it
				// for simplicity, assume customer.id === user.monoCustomerId
				console.log(
					"First account linked, find user by another means if needed",
				);
			}

			// Save bank connection
			await BankConnection.findOneAndUpdate(
				{ monoAccountId: account.id },
				{
					userId: user?._id,
					monoCustomerId: customer.id,
					monoAccountId: account.id,
					accountName: account.name,
					accountNumber: account.account_number,
					bankName: account.institution.name,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true },
			);

			res
				.status(200)
				.json({ success: true, message: "Account linked successfully" });
		} else {
			res.status(200).json({ success: true, message: "Webhook received" });
		}
	} catch (err) {
		console.error("Webhook error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
});

export default router;
