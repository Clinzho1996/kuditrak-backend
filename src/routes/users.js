import express from "express";

import {
	checkConnectionLimit,
	debugDeviceTokens,
	deleteAccount,
	getDeviceTokens,
	getInsights,
	getProfile,
	registerDeviceToken,
	testPushNotification,
	unregisterDeviceToken,
	updateProfile,
	updateProfileImage,
} from "../controllers/userContoller.js";
import protect from "../middleware/auth.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// Get logged in user profile
router.get("/profile", protect, getProfile);

// Update profile image
router.put(
	"/profile-image",
	protect,
	upload.single("image"),
	updateProfileImage,
);

// Get financial insights
router.get("/insights", protect, getInsights);
router.put("/profile", protect, updateProfile);
// backend/routes/userRoutes.js
router.post("/test", protect, testPushNotification);
router.post("/device-token", protect, registerDeviceToken);
router.delete("/device-token", protect, unregisterDeviceToken);
router.get("/check-limit", protect, checkConnectionLimit);
router.get("/device-tokens", protect, getDeviceTokens);
router.get('/debug-tokens', protect, debugDeviceTokens);

// Delete user account
router.delete("/delete-account", protect, deleteAccount);

export default router;
