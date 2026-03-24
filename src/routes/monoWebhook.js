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

			// Find the user by monoCustomerId
			let user = await User.findOne({ monoCustomerId: customer.id });

			if (!user) {
				console.log(
					"First account linked: user not found by monoCustomerId. You may need to associate manually or by email.",
				);
				// Optionally, you can try: user = await User.findOne({ email: account.email });
				// If no user found, just log and skip saving
				return res.status(404).json({
					success: false,
					message:
						"User not found for this Mono customer ID. Manual association may be needed.",
				});
			}

			// Upsert the bank connection
			const connection = await BankConnection.findOneAndUpdate(
				{ monoAccountId: account.id },
				{
					userId: user._id,
					monoCustomerId: customer.id,
					monoAccountId: account.id,
					accountName: account.name,
					accountNumber: account.account_number || account.accountNumber,
					bankName: account.institution.name,
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true }, // returns the saved document
			);

			res.status(200).json({
				success: true,
				message: "Account linked successfully",
				connection,
			});
		} else {
			res.status(200).json({ success: true, message: "Webhook received" });
		}
	} catch (err) {
		console.error("Webhook error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
});

export default router;
