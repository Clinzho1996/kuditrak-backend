import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import { generateFinancialInsights } from "../services/aiService.js";
import { removeDeviceToken, saveDeviceToken, sendPushToUser } from "../services/pushService.js";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUD_NAME,
	api_key: process.env.CLOUD_KEY,
	api_secret: process.env.CLOUD_SECRET,
});

/*
|--------------------------------------------------------------------------
| Get Financial Insights
|--------------------------------------------------------------------------
*/
export const getInsights = async (req, res) => {
	try {
		const insights = await generateFinancialInsights(req.user._id);

		res.status(200).json({
			success: true,
			data: insights,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Get Profile
|--------------------------------------------------------------------------
*/
export const getProfile = async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select("-password");

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		res.status(200).json(user);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Update Profile Image
|--------------------------------------------------------------------------
*/
export const updateProfileImage = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No image uploaded" });
		}

		const result = await cloudinary.uploader.upload(req.file.path, {
			folder: "kuditrak/profile",
		});

		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		user.profileImage = result.secure_url;
		await user.save();

		res.status(200).json({
			message: "Profile image updated",
			profileImage: result.secure_url,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const updateProfile = async (req, res) => {
	try {
		const { fullName, email, phoneNumber } = req.body;
		const userId = req.user._id;

		// Find user
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Check if email is being changed and if it's already taken
		if (email && email !== user.email) {
			const existingUser = await User.findOne({ email });
			if (existingUser) {
				return res.status(400).json({ error: "Email already in use" });
			}
			user.email = email;
		}

		// Update fields
		if (fullName) user.fullName = fullName;
		if (phoneNumber) user.phoneNumber = phoneNumber;

		// Save updated user
		await user.save();

		// Return updated user without password
		const updatedUser = await User.findById(userId).select("-password");

		res.status(200).json({
			success: true,
			message: "Profile updated successfully",
			user: updatedUser,
		});
	} catch (err) {
		console.error("Update profile error:", err);
		res.status(500).json({ error: err.message });
	}
};

/*
|--------------------------------------------------------------------------
| Delete Account
|--------------------------------------------------------------------------
*/
export const deleteAccount = async (req, res) => {
	try {
		const { reason } = req.body;

		const user = await User.findById(req.user._id);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		user.deletedReason = reason;
		await user.save();

		await User.findByIdAndDelete(req.user._id);

		res.status(200).json({
			message: "Account deleted successfully",
			reason,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// backend/controllers/accountController.js
export const checkConnectionLimit = async (req, res) => {
	try {
		const userId = req.user._id;
		const user = await User.findById(userId);
		const plan = user.subscription?.plan || "free";

		const limits = {
			free: 0,
			basic: 3,
			pro: Infinity,
		};

		const bankCount = await BankConnection.countDocuments({
			userId,
			status: "Active",
		});
		const canConnect = bankCount < limits[plan];

		res.status(200).json({
			success: true,
			canConnect,
			message: canConnect
				? "You can connect bank accounts"
				: "Upgrade to connect bank accounts",
			remaining: limits[plan] - bankCount,
			plan,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const registerDeviceToken = async (req, res) => {
	try {
		const { userId, token, deviceType } = req.body;

		// Verify the authenticated user matches the userId
		if (req.user._id.toString() !== userId) {
			return res.status(403).json({ error: "Unauthorized" });
		}

		if (!token || !deviceType) {
			return res
				.status(400)
				.json({ error: "Token and deviceType are required" });
		}

		await saveDeviceToken(userId, token, deviceType);

		res.status(200).json({
			success: true,
			message: "Device token registered successfully",
		});
	} catch (err) {
		console.error("Register device token error:", err);
		res.status(500).json({ error: err.message });
	}
};

export const unregisterDeviceToken = async (req, res) => {
	try {
		const { userId, token } = req.body;

		// Verify the authenticated user matches the userId
		if (req.user._id.toString() !== userId) {
			return res.status(403).json({ error: "Unauthorized" });
		}

		if (!token) {
			return res.status(400).json({ error: "Token is required" });
		}

		await removeDeviceToken(userId, token);

		res.status(200).json({
			success: true,
			message: "Device token unregistered successfully",
		});
	} catch (err) {
		console.error("Unregister device token error:", err);
		res.status(500).json({ error: err.message });
	}
};

// backend/controllers/userController.js
export const testPushNotification = async (req, res) => {
	try {
		const userId = req.user._id;
		
		console.log("🧪 Testing push for user:", userId);
		
		// Send a test notification
		await sendPushToUser(
			userId,
			"🧪 Test Notification",
			"This is a test push notification from Kuditrak!",
			{ type: "test", timestamp: new Date().toISOString() }
		);
		
		res.status(200).json({ 
			success: true, 
			message: "Test notification sent. Check your device!" 
		});
	} catch (err) {
		console.error("Test push error:", err);
		res.status(500).json({ error: err.message });
	}
};