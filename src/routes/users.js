import express from "express";

import {
	checkConnectionLimit,
	deleteAccount,
	getInsights,
	getProfile,
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
router.get("/check-limit", protect, checkConnectionLimit);

// Delete user account
router.delete("/delete-account", protect, deleteAccount);

export default router;
