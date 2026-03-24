// controllers/monoWebhookController.js
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

export const handleMonoWebhook = async (req, res) => {
	try {
		const event = req.body;

		console.log("Mono webhook received:", event);

		// Example event structure
		// event.type = "ACCOUNT_LINKED"
		// event.data.account.id = "69c2b36cec13bf687b14c4c9"
		// event.data.customer.id = "69c27eeafd757da78723da46"
		// event.data.account.name, account_number, institution, etc.

		if (!event.type || !event.data) {
			return res
				.status(400)
				.json({ success: false, error: "Invalid webhook payload" });
		}

		if (event.type === "ACCOUNT_LINKED") {
			const { account, customer } = event.data;

			// Find the user in your DB by monoCustomerId
			const user = await User.findOne({ monoCustomerId: customer.id });
			if (!user) {
				return res
					.status(404)
					.json({ success: false, error: "User not found" });
			}

			// Check if this account already exists
			const existing = await BankConnection.findOne({
				monoAccountId: account.id,
				userId: user._id,
			});

			if (existing) {
				return res
					.status(200)
					.json({ success: true, message: "Account already linked" });
			}

			// Save the account
			await BankConnection.create({
				userId: user._id,
				provider: "mono",
				accountName: account.name,
				accountNumber: account.account_number,
				bankName: account.institution.name,
				monoCustomerId: customer.id,
				monoAccountId: account.id,
				status: "Active",
			});

			return res
				.status(200)
				.json({ success: true, message: "Account linked successfully" });
		}

		res.status(200).json({ success: true, message: "Webhook received" });
	} catch (err) {
		console.error("Mono webhook error:", err.message);
		res.status(500).json({ success: false, error: err.message });
	}
};
