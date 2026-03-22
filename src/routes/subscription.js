// backend/routes/subscriptionRoutes.js
import express from "express";
import {
	cancelSubscription,
	getSubscription,
	verifySubscription,
} from "../controllers/subscriptionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", getSubscription);
router.post("/verify", verifySubscription);
router.post("/cancel", cancelSubscription);

export default router;
