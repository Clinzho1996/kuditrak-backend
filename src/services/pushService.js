// backend/services/pushService.js
import { Expo } from "expo-server-sdk";
import User from "../models/User.js";

// Create a new Expo SDK client
const expo = new Expo();

// Send push notification to a specific user
export const sendPushToUser = async (userId, title, body, data = {}) => {
	try {
		console.log(`📱 Sending push to user: ${userId}`);
		console.log(`Title: ${title}`);
		console.log(`Body: ${body}`);

		// Find user with device tokens
		const user = await User.findById(userId).select(
			"deviceTokens email fullName",
		);

		if (!user) {
			console.log(`❌ User not found: ${userId}`);
			return { success: false, message: "User not found" };
		}

		if (!user.deviceTokens || user.deviceTokens.length === 0) {
			console.log(`❌ No device tokens for user: ${user.email}`);
			return { success: false, message: "No device tokens" };
		}

		console.log(
			`✅ Found ${user.deviceTokens.length} device token(s) for ${user.email}`,
		);

		const messages = [];
		const validTokens = [];

		// Prepare messages for each valid token
		for (const deviceToken of user.deviceTokens) {
			console.log(`Checking token: ${deviceToken.token.substring(0, 30)}...`);

			// Check if it's a valid Expo push token
			if (!Expo.isExpoPushToken(deviceToken.token)) {
				console.log(`❌ Invalid Expo push token: ${deviceToken.token}`);
				continue;
			}

			validTokens.push(deviceToken.token);

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
			});
		}

		if (messages.length === 0) {
			console.log("❌ No valid Expo push tokens found");
			return { success: false, message: "No valid tokens" };
		}

		console.log(`📤 Sending ${messages.length} push notification(s)...`);

		// Send notifications in chunks
		const chunks = expo.chunkPushNotifications(messages);
		const tickets = [];
		const errors = [];

		for (const chunk of chunks) {
			try {
				const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
				tickets.push(...ticketChunk);

				// Check for errors in tickets
				ticketChunk.forEach((ticket, index) => {
					if (ticket.status === "error") {
						console.log(`Ticket error: ${ticket.message}`);
						errors.push({
							token: messages[index]?.to,
							error: ticket.message,
						});

						// If token is invalid, remove it from database
						if (ticket.message === "DeviceNotRegistered") {
							console.log(`Removing invalid token: ${messages[index]?.to}`);
							User.findByIdAndUpdate(user._id, {
								$pull: { deviceTokens: { token: messages[index]?.to } },
							});
						}
					}
				});
			} catch (error) {
				console.error("Error sending chunk:", error);
				errors.push({ error: error.message });
			}
		}

		console.log(
			`✅ Push sent: ${messages.length - errors.length} successful, ${errors.length} failed`,
		);

		return {
			success: true,
			sent: messages.length - errors.length,
			failed: errors.length,
			errors: errors.length > 0 ? errors : undefined,
		};
	} catch (error) {
		console.error("❌ Error sending push notification:", error);
		throw error;
	}
};

// Save device token for user
export const saveDeviceToken = async (userId, token, deviceType) => {
	try {
		console.log(`💾 Saving device token for user: ${userId}`);

		const userObjectId =
			typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

		// Remove this token from any other user first (cleanup)
		await User.updateMany(
			{ "deviceTokens.token": token },
			{ $pull: { deviceTokens: { token: token } } },
		);

		// Add token to current user
		const user = await User.findById(userObjectId);

		if (!user) {
			throw new Error("User not found");
		}

		if (!user.deviceTokens) {
			user.deviceTokens = [];
		}

		// Check if token already exists for this user
		const existingToken = user.deviceTokens.find((t) => t.token === token);

		if (existingToken) {
			existingToken.lastUsed = new Date();
			existingToken.deviceType = deviceType;
		} else {
			user.deviceTokens.push({
				token,
				deviceType,
				lastUsed: new Date(),
				createdAt: new Date(),
			});
		}

		await user.save();
		console.log(`✅ Device token saved for ${user.email}`);

		return user;
	} catch (error) {
		console.error("Error saving device token:", error);
		throw error;
	}
};

// Remove device token
export const removeDeviceToken = async (userId, token) => {
	try {
		const result = await User.findByIdAndUpdate(
			userId,
			{ $pull: { deviceTokens: { token: token } } },
			{ new: true },
		);

		console.log(`✅ Device token removed for user ${userId}`);
		return result;
	} catch (error) {
		console.error("Error removing device token:", error);
		throw error;
	}
};

// Remove all device tokens for a user
export const removeAllDeviceTokens = async (userId) => {
	try {
		const result = await User.findByIdAndUpdate(
			userId,
			{ $set: { deviceTokens: [] } },
			{ new: true },
		);

		console.log(`✅ All device tokens removed for user ${userId}`);
		return result;
	} catch (error) {
		console.error("Error removing all device tokens:", error);
		throw error;
	}
};

// Legacy sendPush function (keep for backward compatibility)
export const sendPush = async (pushToken, title, body, data = {}) => {
	try {
		if (!Expo.isExpoPushToken(pushToken)) {
			console.error(`Invalid push token: ${pushToken}`);
			return { success: false, message: "Invalid push token" };
		}

		const message = {
			to: pushToken,
			sound: "default",
			title: title,
			body: body,
			data: data,
			priority: "high",
		};

		const ticket = await expo.sendPushNotificationsAsync([message]);
		console.log("Push sent:", ticket);

		return { success: true, ticket: ticket[0] };
	} catch (error) {
		console.error("Error sending push:", error);
		throw error;
	}
};
