import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import { generateFinancialInsights } from "../services/aiService.js";
import {
	removeDeviceToken,
	saveDeviceToken,
	sendPushToUser,
} from "../services/pushService.js";

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

// controllers/userContoller.js - Update your updateKYC function

export const updateKYC = async (req, res) => {
	try {
		const userId = req.user._id;
		const { bvn, dateOfBirth, address, identification } = req.body;

		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// STEP 1: Verify BVN with Paystack
		if (bvn) {
			const bvnVerification = await verifyBVN(bvn, user);

			if (!bvnVerification.success) {
				return res.status(400).json({
					error: "BVN verification failed",
					message: bvnVerification.message,
				});
			}

			// BVN is valid, save it
			user.kyc.bvn = bvn;
			user.kyc.bvnVerified = true;
			user.kyc.bvnVerificationData = bvnVerification.data;
		}

		if (dateOfBirth) user.kyc.dateOfBirth = new Date(dateOfBirth);
		if (address) {
			user.kyc.address = {
				...user.kyc.address,
				...address,
				country: address.country || "NG",
			};
		}
		if (identification) {
			user.kyc.identification = {
				...user.kyc.identification,
				...identification,
			};
		}

		// Check if all required KYC fields are complete
		const isKYCComplete =
			user.kyc.bvn &&
			user.kyc.bvnVerified && // BVN must be verified
			user.kyc.dateOfBirth &&
			user.kyc.address?.street &&
			user.kyc.address?.city &&
			user.kyc.address?.state &&
			user.kyc.identification?.type &&
			user.kyc.identification?.number;

		if (isKYCComplete && !user.kyc.isVerified) {
			user.kyc.isVerified = true;
			user.kyc.verifiedAt = new Date();

			// Send notification that KYC is complete
			try {
				await sendPushToUser(
					userId,
					"✅ KYC Verified!",
					"Your KYC has been verified. You can now fund your wallet via bank transfer!",
					{ type: "kyc_complete", screen: "topup" },
				);
			} catch (notifError) {
				console.error("Failed to send KYC notification:", notifError);
			}
		}

		await user.save();

		res.status(200).json({
			success: true,
			message: "KYC information updated successfully",
			kyc: {
				isVerified: user.kyc.isVerified,
				isComplete: isKYCComplete,
				hasBvn: !!user.kyc.bvn,
				bvnVerified: user.kyc.bvnVerified || false,
				hasDateOfBirth: !!user.kyc.dateOfBirth,
				hasAddress: !!(
					user.kyc.address?.street &&
					user.kyc.address?.city &&
					user.kyc.address?.state
				),
				hasIdentification: !!(
					user.kyc.identification?.type && user.kyc.identification?.number
				),
			},
		});
	} catch (err) {
		console.error("Update KYC error:", err);
		res.status(500).json({ error: err.message });
	}
};
// Get KYC status
export const getKYCStatus = async (req, res) => {
	try {
		const userId = req.user._id;
		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const isKYCComplete =
			user.kyc.bvn &&
			user.kyc.dateOfBirth &&
			user.kyc.address?.street &&
			user.kyc.address?.city &&
			user.kyc.address?.state &&
			user.kyc.identification?.type &&
			user.kyc.identification?.number;

		res.status(200).json({
			success: true,
			kyc: {
				isVerified: user.kyc.isVerified,
				isComplete: isKYCComplete,
				hasBvn: !!user.kyc.bvn,
				hasDateOfBirth: !!user.kyc.dateOfBirth,
				hasAddress: !!user.kyc.address?.street,
				hasIdentification: !!user.kyc.identification?.type,
			},
		});
	} catch (err) {
		console.error("Get KYC status error:", err);
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

// backend/controllers/userController.js - Add this endpoint
export const getDeviceTokens = async (req, res) => {
	try {
		const userId = req.user._id;

		const user = await User.findById(userId)
			.select("deviceTokens email fullName")
			.lean();

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		console.log("Device tokens for user:", {
			userId: user._id,
			email: user.email,
			tokens: user.deviceTokens,
		});

		res.json({
			success: true,
			user: {
				id: user._id,
				email: user.email,
				fullName: user.fullName,
			},
			deviceTokens: user.deviceTokens || [],
			tokenCount: user.deviceTokens?.length || 0,
			tokens: user.deviceTokens?.map((t) => ({
				token: t.token,
				deviceType: t.deviceType,
				lastUsed: t.lastUsed,
			})),
		});
	} catch (error) {
		console.error("Error getting device tokens:", error);
		res.status(500).json({ error: error.message });
	}
};

// Update your testPushNotification function
export const testPushNotification = async (req, res) => {
	try {
		const userId = req.user._id;

		console.log("🧪 Testing push for user:", userId);

		// First, get the device tokens to debug
		const user = await User.findById(userId).select("deviceTokens email");
		console.log("User found:", user ? user.email : "No user");
		console.log("Device tokens:", user?.deviceTokens);
		console.log("Token count:", user?.deviceTokens?.length);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (!user.deviceTokens || user.deviceTokens.length === 0) {
			return res.status(400).json({
				success: false,
				message: "No device tokens registered for this user",
				user: { email: user.email },
			});
		}

		// Log each token
		user.deviceTokens.forEach((token, index) => {
			console.log(`Token ${index + 1}:`, {
				token: token.token,
				deviceType: token.deviceType,
				// isValidExpo: require("expo-server-sdk").Expo.isExpoPushToken(
				// 	token.token,
				// ),
			});
		});

		// Send a test notification
		const result = await sendPushToUser(
			userId,
			"🧪 Test Notification",
			"This is a test push notification from Kuditrak! Tap to open the app.",
			{
				type: "test",
				timestamp: new Date().toISOString(),
				screen: "home",
			},
		);

		res.status(200).json({
			success: true,
			message: "Test notification sent!",
			result,
			debug: {
				hasTokens: user.deviceTokens.length > 0,
				tokenCount: user.deviceTokens.length,
				tokens: user.deviceTokens.map((t) => ({
					preview: t.token.substring(0, 20) + "...",
					deviceType: t.deviceType,
				})),
			},
		});
	} catch (err) {
		console.error("Test push error:", err);
		res.status(500).json({ error: err.message });
	}
};

// backend/controllers/userController.js
export const debugDeviceTokens = async (req, res) => {
	try {
		const userId = req.user._id;

		// Find user with raw query to see exactly what's stored
		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		console.log("=== DEBUG DEVICE TOKENS ===");
		console.log("User ID:", userId);
		console.log("User Email:", user.email);
		console.log("Device Tokens Array:", user.deviceTokens);
		console.log("Device Tokens Type:", typeof user.deviceTokens);
		console.log("Is Array:", Array.isArray(user.deviceTokens));
		console.log("Length:", user.deviceTokens?.length);

		// Check if tokens exist but in wrong format
		if (user.deviceTokens && user.deviceTokens.length > 0) {
			user.deviceTokens.forEach((token, index) => {
				console.log(`Token ${index}:`, {
					token: token.token,
					tokenType: typeof token.token,
					deviceType: token.deviceType,
					lastUsed: token.lastUsed,
					_id: token._id,
				});
			});
		} else {
			console.log("No tokens found in user document");

			// Check if tokens might be stored elsewhere
			console.log("Full user object keys:", Object.keys(user.toObject()));
		}

		res.json({
			success: true,
			debug: {
				userId: user._id,
				email: user.email,
				hasDeviceTokens: !!user.deviceTokens,
				isArray: Array.isArray(user.deviceTokens),
				tokenCount: user.deviceTokens?.length || 0,
				tokens: user.deviceTokens || [],
				rawTokens: JSON.stringify(user.deviceTokens),
			},
		});
	} catch (error) {
		console.error("Debug error:", error);
		res.status(500).json({ error: error.message });
	}
};
