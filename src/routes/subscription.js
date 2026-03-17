// routes/subscription.js

import express from "express";
import {
	getSubscription,
	upgradeSubscription,
	verifySubscription,
} from "../controllers/subscriptionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

router.post("/upgrade", protect, upgradeSubscription);
router.get("/verify", verifySubscription);
router.get("/", protect, getSubscription);

export default router;
