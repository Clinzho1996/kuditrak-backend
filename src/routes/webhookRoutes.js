// routes/webhookRoutes.js
import express from "express";
import { handleCustomerIdentificationWebhook } from "../services/dvaService.js";

const router = express.Router();

// Paystack webhook endpoint
router.post("/paystack", async (req, res) => {
	try {
		const event = req.body;
		console.log("📨 Paystack webhook received:", event.event);

		if (
			event.event === "customeridentification.success" ||
			event.event === "customeridentification.failed"
		) {
			await handleCustomerIdentificationWebhook(event.event, event.data);
		}

		res.sendStatus(200);
	} catch (error) {
		console.error("Webhook error:", error);
		res.sendStatus(500);
	}
});

export default router;
