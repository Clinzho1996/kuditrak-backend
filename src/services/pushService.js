// backend/services/firebaseService.js
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js"; // Add this

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
		if (!token) return;

		await User.findByIdAndUpdate(userId, {
			$addToSet: {
				deviceTokens: {
					token,
					deviceType,
					lastUsed: new Date(),
				},
			},
		});
		console.log(`Token saved for user ${userId}`);
	} catch (err) {
		console.error("Save token error:", err.message);
	}
};

/**
 * Remove device token (on logout or token invalid)
 */
export const removeDeviceToken = async (userId, token) => {
	try {
		await User.findByIdAndUpdate(userId, {
			$pull: { deviceTokens: { token } },
		});
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
			return;
		}

		const user = await User.findById(userId);
		if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
			console.log(`No device tokens for user ${userId}`);
			return;
		}

		const tokens = user.deviceTokens.map((t) => t.token);

		const response = await admin.messaging().sendEachForMulticast({
			tokens,
			notification: {
				title,
				body,
				...(Platform.OS === "ios" && { sound: "default" }),
			},
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
			`Push sent to ${response.successCount} devices, failed: ${response.failureCount}`,
		);

		// Remove invalid tokens
		if (response.failureCount > 0) {
			const invalidTokens = [];
			response.responses.forEach((resp, idx) => {
				if (!resp.success) {
					invalidTokens.push(tokens[idx]);
				}
			});

			if (invalidTokens.length > 0) {
				await User.findByIdAndUpdate(userId, {
					$pull: { deviceTokens: { token: { $in: invalidTokens } } },
				});
			}
		}

		return response;
	} catch (err) {
		console.error("Push notification error:", err.message);
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

		const response = await admin.messaging().sendEachForMulticast({
			tokens: [...new Set(allTokens)], // Remove duplicates
			notification: { title, body },
			data,
		});

		console.log(`Push sent to ${response.successCount} devices`);
		return response;
	} catch (err) {
		console.error("Batch push error:", err.message);
	}
};

/**
 * Send push notification (legacy - for single token)
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

		await admin.messaging().send(message);
		console.log(`Push sent to ${token}`);
	} catch (err) {
		console.error("Push notification error:", err.message);
	}
};

export default firebaseApp;
