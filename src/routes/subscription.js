// backend/routes/subscriptionRoutes.js
import express from "express";
import {
	cleanDatabase,
	getSubscription,
	syncSubscription,
} from "../controllers/subscriptionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

// Public webhook endpoint (no auth required)
// router.post("/webhook/revenuecat", handleRevenueCatWebhook);

// Protected routes
router.use(protect); // All routes below require authentication

router.get("/", getSubscription);
router.post("/sync", syncSubscription);
router.post("/clean", cleanDatabase);

export default router;
