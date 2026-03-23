// backend/services/pushService.js
import { Expo } from "expo-server-sdk";
import User from "../models/User.js";
import firebaseApp from "./firebaseService.js";

// Create a new Expo SDK client
const expo = new Expo();

// backend/services/pushService.js
export const saveDeviceToken = async (userId, token, deviceType) => {
	try {
		console.log("Saving device token for user:", userId);
		console.log("Token:", token);
		console.log("Device type:", deviceType);

		// Convert userId to ObjectId if it's a string
		const userObjectId =
			typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

		const user = await User.findById(userObjectId);

		if (!user) {
			console.log("User not found:", userId);
			throw new Error("User not found");
		}

		console.log("User found:", user.email);
		console.log("Current device tokens:", user.deviceTokens);

		// Initialize deviceTokens array if it doesn't exist
		if (!user.deviceTokens) {
			user.deviceTokens = [];
		}

		// Check if token already exists
		const existingTokenIndex = user.deviceTokens.findIndex(
			(t) => t.token === token,
		);

		if (existingTokenIndex !== -1) {
			// Update existing token
			user.deviceTokens[existingTokenIndex].lastUsed = new Date();
			user.deviceTokens[existingTokenIndex].deviceType = deviceType;
			console.log("Updating existing token");
		} else {
			// Add new token
			user.deviceTokens.push({
				token,
				deviceType,
				lastUsed: new Date(),
				createdAt: new Date(),
			});
			console.log("Adding new token");
		}

		await user.save();
		console.log("User saved successfully");
		console.log("Updated device tokens:", user.deviceTokens);

		return user;
	} catch (error) {
		console.error("Error saving device token:", error);
		throw error;
	}
};

export const removeDeviceToken = async (userId, token) => {
	try {
		const result = await User.findByIdAndUpdate(
			userId,
			{ $pull: { deviceTokens: { token } } },
			{ new: true },
		);

		if (result) {
			console.log(`✅ Device token removed for user ${userId}`);
		}
		return result;
	} catch (error) {
		console.error("Error removing device token:", error);
		throw error;
	}
};

export const sendPushToUser = async (userId, title, body, data = {}) => {
	try {
		console.log(`📱 Looking for user: ${userId}`);

		// Find user and populate device tokens
		const user = await User.findById(userId).select(
			"deviceTokens email fullName",
		);

		if (!user) {
			console.log(`❌ User not found: ${userId}`);
			return { success: false, message: "User not found" };
		}

		console.log(`User found: ${user.email}`);
		console.log(`Device tokens count: ${user.deviceTokens?.length || 0}`);

		if (!user.deviceTokens || user.deviceTokens.length === 0) {
			console.log(`❌ No device tokens for user: ${userId}`);

			// Log the actual user data for debugging
			const rawUser = await User.findById(userId);
			console.log("Raw user deviceTokens:", rawUser?.deviceTokens);

			return { success: false, message: "No device tokens found" };
		}

		// Log all tokens
		user.deviceTokens.forEach((token, index) => {
			console.log(`Token ${index + 1}:`, {
				token: token.token,
				type: token.deviceType,
				isExpoToken: Expo.isExpoPushToken(token.token),
			});
		});

		const messages = [];

		// Prepare messages for each valid token
		for (const deviceToken of user.deviceTokens) {
			// Check if it's a valid Expo push token
			if (!Expo.isExpoPushToken(deviceToken.token)) {
				console.log(`❌ Invalid Expo push token: ${deviceToken.token}`);
				continue;
			}

			messages.push({
				to: deviceToken.token,
				sound: "default",
				title: title,
				body: body,
				data: {
					...data,
					userId: user._id.toString(),
					timestamp: new Date().toISOString(),
				},
				priority: "high",
				_displayInForeground: true,
			});
		}

		if (messages.length === 0) {
			console.log("❌ No valid Expo push tokens found");
			return { success: false, message: "No valid Expo push tokens" };
		}

		console.log(`📤 Sending ${messages.length} push notification(s)...`);

		// Send notifications in chunks (Expo supports up to 100 per request)
		const chunks = expo.chunkPushNotifications(messages);
		const tickets = [];

		for (const chunk of chunks) {
			try {
				const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
				console.log("Ticket chunk result:", ticketChunk);
				tickets.push(...ticketChunk);
			} catch (error) {
				console.error("Error sending chunk:", error);
			}
		}

		// Check for errors in tickets and clean up invalid tokens
		const errors = [];
		const receipts = [];

		for (const ticket of tickets) {
			if (ticket.status === "error") {
				errors.push(ticket);
				console.log("Ticket error:", ticket);

				// If token is invalid, remove it from database
				if (ticket.message === "DeviceNotRegistered" && ticket.details?.error) {
					console.log(`Removing invalid token: ${ticket.details.error}`);
					await User.findByIdAndUpdate(user._id, {
						$pull: { deviceTokens: { token: ticket.details.error } },
					});
				}
			} else if (ticket.status === "ok") {
				receipts.push(ticket.id);
			}
		}

		console.log(
			`✅ Push notifications sent: ${messages.length - errors.length} successful, ${errors.length} failed`,
		);

		return {
			success: true,
			tickets,
			sent: messages.length - errors.length,
			failed: errors.length,
			errors: errors.length > 0 ? errors : undefined,
		};
	} catch (error) {
		console.error("❌ Error sending push notification:", error);
		throw error;
	}
};

// Function to get user's device tokens (for debugging)
export const getUserDeviceTokens = async (userId) => {
	try {
		const user = await User.findById(userId).select(
			"deviceTokens email fullName",
		);
		return {
			user: user ? { email: user.email, fullName: user.fullName } : null,
			deviceTokens: user?.deviceTokens || [],
			count: user?.deviceTokens?.length || 0,
		};
	} catch (error) {
		console.error("Error getting device tokens:", error);
		throw error;
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
