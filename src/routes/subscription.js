// backend/routes/subscriptionRoutes.js
import express from "express";
import {
	cancelSubscription,
	getSubscription,
	getSubscriptionStatus,
	syncSubscription,
	verifySubscription,
} from "../controllers/subscriptionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get current subscription
router.get("/", getSubscription);

// Get subscription status
router.get("/status", getSubscriptionStatus);

// Sync subscription (for RevenueCat)
router.post("/sync", syncSubscription);

// Verify subscription (legacy)
router.post("/verify", verifySubscription);

// Cancel subscription
router.post("/cancel", cancelSubscription);

export default router;
