// backend/services/firebaseService.js
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";

// Fix dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount;

// PRODUCTION (Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
	try {
		serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
	} catch (err) {
		console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON");
	}
}

// LOCAL DEVELOPMENT
else {
	try {
		const filePath = path.join(__dirname, "../config/serviceAccountKey.json");

		if (fs.existsSync(filePath)) {
			serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} else {
			console.warn("Firebase serviceAccountKey.json not found. Push disabled.");
		}
	} catch (err) {
		console.error("Failed to load Firebase service account key:", err.message);
	}
}

// Initialize Firebase only if credentials exist
let firebaseApp = null;

if (serviceAccount) {
	firebaseApp = admin.apps.length
		? admin.app()
		: admin.initializeApp({
				credential: admin.credential.cert(serviceAccount),
			});
}

/**
 * Save device token for a user
 */
export const saveDeviceToken = async (userId, token, deviceType) => {
	try {
		console.log(`💾 Saving token for user ${userId}:`, {
			token: token?.substring(0, 20),
			deviceType,
		});

		const user = await User.findById(userId);
		if (!user) {
			console.log("❌ User not found");
			return;
		}

		// Initialize deviceTokens array if it doesn't exist
		if (!user.deviceTokens) {
			user.deviceTokens = [];
		}

		// Check if token already exists
		const existingToken = user.deviceTokens.find((t) => t.token === token);
		if (existingToken) {
			console.log("Token already exists, updating lastUsed");
			existingToken.lastUsed = new Date();
		} else {
			console.log("Adding new token");
			user.deviceTokens.push({
				token,
				deviceType,
				lastUsed: new Date(),
				createdAt: new Date(),
			});
		}

		await user.save();
		console.log(
			`✅ Token saved successfully. Total tokens: ${user.deviceTokens?.length || 0}`,
		);
	} catch (err) {
		console.error("❌ Save token error:", err.message);
		throw err;
	}
};

/**
 * Remove device token
 */
export const removeDeviceToken = async (userId, token) => {
	try {
		const user = await User.findById(userId);
		if (!user) return;

		user.deviceTokens =
			user.deviceTokens?.filter((t) => t.token !== token) || [];
		await user.save();
		console.log(`Token removed for user ${userId}`);
	} catch (err) {
		console.error("Remove token error:", err.message);
	}
};

/**
 * Send push notification to a specific user
 */
export const sendPushToUser = async (userId, title, body, data = {}) => {
	try {
		if (!firebaseApp) {
			console.warn("Firebase not initialized. Push skipped.");
			return { success: false, message: "Firebase not initialized" };
		}

		const user = await User.findById(userId);
		if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
			console.log(`No device tokens for user ${userId}`);
			return { success: false, message: "No device tokens found" };
		}

		const tokens = user.deviceTokens.map((t) => t.token);
		console.log(`Sending push to ${tokens.length} devices`);

		// Create notification payload (without Platform - that's frontend only)
		const message = {
			notification: {
				title,
				body,
			},
			data: {
				...data,
				timestamp: new Date().toISOString(),
			},
			apns: {
				payload: {
					aps: {
						sound: "default",
						badge: 1,
					},
				},
			},
			android: {
				priority: "high",
				notification: {
					sound: "default",
					channelId: "default",
				},
			},
		};

		// Send to all devices (multicast)
		const response = await admin.messaging().sendEachForMulticast({
			tokens,
			...message,
		});

		console.log(
			`Push sent - Success: ${response.successCount}, Failed: ${response.failureCount}`,
		);

		// Remove invalid tokens
		if (response.failureCount > 0) {
			const invalidTokens = [];
			response.responses.forEach((resp, idx) => {
				if (!resp.success) {
					console.log(`Invalid token: ${tokens[idx]}`);
					invalidTokens.push(tokens[idx]);
				}
			});

			if (invalidTokens.length > 0) {
				user.deviceTokens = user.deviceTokens.filter(
					(t) => !invalidTokens.includes(t.token),
				);
				await user.save();
				console.log(`Removed ${invalidTokens.length} invalid tokens`);
			}
		}

		return {
			success: true,
			successCount: response.successCount,
			failureCount: response.failureCount,
		};
	} catch (err) {
		console.error("Push notification error:", err.message);
		return { success: false, error: err.message };
	}
};

/**
 * Send push notification to multiple users
 */
export const sendPushToUsers = async (userIds, title, body, data = {}) => {
	try {
		const users = await User.find({ _id: { $in: userIds } });
		const allTokens = users.flatMap(
			(u) => u.deviceTokens?.map((t) => t.token) || [],
		);

		if (allTokens.length === 0) return;

		const uniqueTokens = [...new Set(allTokens)];
		console.log(`Sending push to ${uniqueTokens.length} unique devices`);

		const response = await admin.messaging().sendEachForMulticast({
			tokens: uniqueTokens,
			notification: { title, body },
			data,
			apns: {
				payload: {
					aps: {
						sound: "default",
						badge: 1,
					},
				},
			},
			android: {
				priority: "high",
				notification: {
					sound: "default",
					channelId: "default",
				},
			},
		});

		console.log(
			`Batch push - Success: ${response.successCount}, Failed: ${response.failureCount}`,
		);
		return response;
	} catch (err) {
		console.error("Batch push error:", err.message);
	}
};

/**
 * Send push notification to a single token (legacy)
 */
export const sendPush = async (token, title, body, data = {}) => {
	try {
		if (!firebaseApp) {
			console.warn("Firebase not initialized. Push skipped.");
			return;
		}

		const message = {
			token,
			notification: { title, body },
			data,
			apns: {
				payload: {
					aps: {
						sound: "default",
						badge: 1,
					},
				},
			},
			android: {
				priority: "high",
				notification: {
					sound: "default",
					channelId: "default",
				},
			},
		};

		const response = await admin.messaging().send(message);
		console.log(`Push sent to ${token}`);
		return response;
	} catch (err) {
		console.error("Push notification error:", err.message);
	}
};

export default firebaseApp;
