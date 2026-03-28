// backend/routes/subscriptionRoutes.js
import express from "express";
import {
	cancelSubscription,
	fixSubscriptionData,
	getSubscription,
	getSubscriptionHistory,
	getSubscriptionStatus,
	handleRevenueCatWebhook,
	syncSubscription,
	verifyWithRevenueCat,
} from "../controllers/subscriptionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

// Public webhook endpoint (no auth required)
router.post("/webhook/revenuecat", handleRevenueCatWebhook);

// Protected routes
router.use(protect); // All routes below require authentication

router.get("/", getSubscription);
router.get("/status", getSubscriptionStatus);
router.get("/history", getSubscriptionHistory);
router.post("/sync", syncSubscription);
router.post("/cancel", cancelSubscription);
router.post("/verify", verifyWithRevenueCat);
// backend/routes/subscriptionRoutes.js
router.post("/fix-data", fixSubscriptionData);

export default router;
