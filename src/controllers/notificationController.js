// backend/controllers/notificationController.js
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { sendPush } from "../services/pushService.js";

// ===============================
// GET USER NOTIFICATIONS
// ===============================
export const getNotifications = async (req, res) => {
	try {
		const userId = req.user._id;
		const { page = 1, limit = 20, unread_only = false } = req.query;

		const query = { userId };
		if (unread_only === "true") {
			query.is_read = false;
		}

		const notifications = await Notification.find(query)
			.sort({ created_at: -1 })
			.skip((page - 1) * limit)
			.limit(parseInt(limit));

		const total = await Notification.countDocuments(query);
		const unreadCount = await Notification.countDocuments({
			userId,
			is_read: false,
		});

		res.status(200).json({
			success: true,
			data: notifications,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
			unreadCount,
		});
	} catch (err) {
		console.error("Get notifications error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// MARK NOTIFICATION AS READ
// ===============================
export const markAsRead = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id } = req.params;

		const notification = await Notification.findOneAndUpdate(
			{ _id: id, userId },
			{
				is_read: true,
				read_at: new Date(),
			},
			{ new: true },
		);

		if (!notification) {
			return res.status(404).json({ error: "Notification not found" });
		}

		res.status(200).json({
			success: true,
			data: notification,
		});
	} catch (err) {
		console.error("Mark as read error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// MARK ALL AS READ
// ===============================
export const markAllAsRead = async (req, res) => {
	try {
		const userId = req.user._id;

		await Notification.updateMany(
			{ userId, is_read: false },
			{
				is_read: true,
				read_at: new Date(),
			},
		);

		res.status(200).json({
			success: true,
			message: "All notifications marked as read",
		});
	} catch (err) {
		console.error("Mark all as read error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// DELETE NOTIFICATION
// ===============================
export const deleteNotification = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id } = req.params;

		const notification = await Notification.findOneAndDelete({
			_id: id,
			userId,
		});

		if (!notification) {
			return res.status(404).json({ error: "Notification not found" });
		}

		res.status(200).json({
			success: true,
			message: "Notification deleted",
		});
	} catch (err) {
		console.error("Delete notification error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// REGISTER PUSH TOKEN
// ===============================
// backend/controllers/notificationController.js
// ===============================
// REGISTER PUSH TOKEN
// ===============================
export const registerPushToken = async (req, res) => {
	try {
		const userId = req.user._id;
		const { token, platform, deviceId } = req.body;

		if (!token || !platform) {
			return res.status(400).json({ error: "Token and platform are required" });
		}

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Initialize pushTokens array if it doesn't exist
		if (!user.pushTokens) {
			user.pushTokens = [];
		}

		// Check if token already exists
		const existingTokenIndex = user.pushTokens.findIndex(
			(t) => t.token === token,
		);

		if (existingTokenIndex !== -1) {
			// Update existing token
			user.pushTokens[existingTokenIndex].lastUsed = new Date();
			user.pushTokens[existingTokenIndex].platform = platform;
			if (deviceId) user.pushTokens[existingTokenIndex].deviceId = deviceId;
		} else {
			// Add new token
			user.pushTokens.push({
				token,
				platform,
				deviceId,
				createdAt: new Date(),
				lastUsed: new Date(),
			});
		}

		await user.save();

		res.status(200).json({
			success: true,
			message: "Push token registered successfully",
		});
	} catch (err) {
		console.error("Register push token error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// UNREGISTER PUSH TOKEN
// ===============================
// ===============================
// UNREGISTER PUSH TOKEN
// ===============================
export const unregisterPushToken = async (req, res) => {
	try {
		const userId = req.user._id;
		const { token } = req.body;

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Initialize pushTokens array if it doesn't exist
		if (!user.pushTokens) {
			user.pushTokens = [];
		}

		// Remove the token
		user.pushTokens = user.pushTokens.filter((t) => t.token !== token);

		await user.save();

		res.status(200).json({
			success: true,
			message: "Push token unregistered",
		});
	} catch (err) {
		console.error("Unregister push token error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// UPDATE NOTIFICATION SETTINGS
// ===============================
export const updateNotificationSettings = async (req, res) => {
	try {
		const userId = req.user._id;
		const settings = req.body;

		const user = await User.findByIdAndUpdate(
			userId,
			{ notificationSettings: settings },
			{ new: true },
		).select("notificationSettings");

		res.status(200).json({
			success: true,
			data: user.notificationSettings,
		});
	} catch (err) {
		console.error("Update notification settings error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// GET NOTIFICATION SETTINGS
// ===============================
export const getNotificationSettings = async (req, res) => {
	try {
		const userId = req.user._id;
		const user = await User.findById(userId).select("notificationSettings");

		res.status(200).json({
			success: true,
			data: user.notificationSettings,
		});
	} catch (err) {
		console.error("Get notification settings error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// CREATE NOTIFICATION (Admin/System)
// ===============================
// ===============================
// CREATE NOTIFICATION (Admin/System)
// ===============================
export const createNotification = async (req, res) => {
	try {
		const { userId, title, body, type, data, sendPush = true } = req.body;

		if (!userId || !title || !body) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		const notification = await Notification.create({
			userId,
			title,
			body,
			type: type || "system",
			data: data || {},
			created_at: new Date(),
		});

		// Send push notification if enabled
		if (sendPush) {
			const user = await User.findById(userId);
			if (user && user.notificationSettings?.push_enabled !== false) {
				// Safely get tokens
				const tokens = user.pushTokens?.map((t) => t.token) || [];
				if (tokens.length > 0) {
					await sendPush(tokens, {
						title,
						body,
						data: {
							notificationId: notification._id.toString(),
							type,
							...data,
						},
					});
					notification.is_push_sent = true;
					await notification.save();
				}
			}
		}

		res.status(201).json({
			success: true,
			data: notification,
		});
	} catch (err) {
		console.error("Create notification error:", err);
		res.status(500).json({ error: err.message });
	}
};

// ===============================
// SEND BULK NOTIFICATION (Admin)
// ===============================
// ===============================
// SEND BULK NOTIFICATION (Admin)
// ===============================
export const sendBulkNotification = async (req, res) => {
	try {
		const { title, body, type, data, userFilter = {} } = req.body;

		if (!title || !body) {
			return res.status(400).json({ error: "Title and body are required" });
		}

		// Find users based on filter
		const users = await User.find({
			...userFilter,
			"notificationSettings.push_enabled": true,
		});

		const notifications = [];
		const pushTokens = [];

		for (const user of users) {
			// Create notification record
			const notification = await Notification.create({
				userId: user._id,
				title,
				body,
				type: type || "system",
				data: data || {},
			});
			notifications.push(notification);

			// Collect push tokens safely
			if (user.pushTokens && user.pushTokens.length > 0) {
				pushTokens.push(...user.pushTokens.map((t) => t.token));
			}
		}

		// Send push notifications
		if (pushTokens.length > 0) {
			await sendPush(pushTokens, {
				title,
				body,
				data: {
					type,
					...data,
				},
			});
		}

		res.status(201).json({
			success: true,
			message: `Sent to ${users.length} users`,
			count: users.length,
		});
	} catch (err) {
		console.error("Bulk notification error:", err);
		res.status(500).json({ error: err.message });
	}
};
