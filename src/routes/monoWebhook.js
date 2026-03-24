import express from "express";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
	try {
		const payload = req.body.data?.data || req.body.data;
		console.log("📥 PAYLOAD:", payload);

		res.status(200).json({ success: true });

		// Only handle account connected/updated events
		if (payload?.id && payload?.customer) {
			const accountId = payload.id;
			const customerId = payload.customer;

			// Find user by saved monoCustomerId
			const user = await User.findOne({ monoCustomerId: customerId });
			if (!user) {
				console.log(
					"❌ Cannot create connection: user not found for account",
					accountId,
				);
				return;
			}

			// Upsert bank connection using top-level fields from payload
			const connection = await BankConnection.findOneAndUpdate(
				{ monoAccountId: accountId },
				{
					userId: user._id,
					monoCustomerId: customerId,
					monoAccountId: accountId,
					accountName: payload.name || "Unknown",
					accountNumber: payload.account_number || "Unknown",
					bankName: payload.institution?.name || "Unknown",
					status: "Active",
					lastSync: new Date(),
				},
				{ upsert: true, new: true },
			);

			console.log("✅ account_connected / updated saved:", connection);
			return;
		}

		console.log("⚠️ Unknown payload:", payload);
	} catch (err) {
		console.error("❌ Webhook error:", err);
	}
});

export default router;
