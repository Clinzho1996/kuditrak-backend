import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import User from "../models/User.js";
import { generateFinancialInsights } from "../services/aiService.js";

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
