import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import BankConnection from "../models/BankConnection.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

import { sendEmail } from "../services/emailService.js";
import { verifyFirebaseToken } from "../services/firebaseService.js";
import { initializeDefaultCategories } from "./categoryController.js";

// Generate JWT
const generateToken = (userId) =>
	jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "30d" });

// Step 1: Signup
// controllers/authController.js
export const signup = async (req, res) => {
	console.log("\n=== Signup Controller ===");
	console.log("Request body:", req.body);
	console.log("Headers:", req.headers);

	try {
		const { fullName, email, password } = req.body;

		// Validate input
		if (!fullName || !email || !password) {
			return res.status(400).json({
				success: false,
				message: "Full name, email and password are required",
				code: "MISSING_FIELDS",
			});
		}

		const existing = await User.findOne({ email });
		if (existing) {
			return res.status(409).json({
				success: false,
				message: "An account with this email already exists",
				code: "EMAIL_ALREADY_EXISTS",
			});
		}

		console.log("Hashing password...");
		const hashedPassword = await bcrypt.hash(password, 10);

		console.log("Creating user...");
		const user = await User.create({
			fullName,
			email,
			password: hashedPassword,
		});

		await initializeDefaultCategories(user._id);
		console.log("User created with ID:", user._id);

		// Create wallet automatically
		await Wallet.create({
			userId: user._id,
		});

		// Send OTP for email verification
		const otp = Math.floor(100000 + Math.random() * 900000);
		console.log("Generated OTP:", otp);

		user.otp = otp;
		user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 min expiry
		await user.save();
		console.log("OTP saved to user");

		console.log("Sending email...");
		await sendEmail({
			to: email,
			subject: "Verify Your Email",
			html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
		});
		console.log("Email sent successfully");

		res
			.status(201)
			.json({ message: "Signup successful, OTP sent", userId: user._id });
	} catch (err) {
		console.error("ERROR in signup:", err);
		console.error("Error stack:", err.stack);
		res.status(500).json({
			success: false,
			message: "Unable to create account. Please try again",
			code: "SIGNUP_FAILED",
		});
	}
};

// Step 2: Confirm OTP
export const confirmOtp = async (req, res) => {
	try {
		const { userId, otp } = req.body;
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
				code: "USER_NOT_FOUND",
			});
		}

		if (user.isVerified) {
			return res.status(400).json({
				success: false,
				message: "Account already verified",
				code: "ALREADY_VERIFIED",
			});
		}

		if (user.otp !== Number(otp) || Date.now() > user.otpExpires) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired OTP",
				code: "INVALID_OTP",
			});
		}

		user.isVerified = true;
		user.otp = undefined;
		user.otpExpires = undefined;
		await user.save();

		const token = generateToken(user._id);
		res.status(200).json({ message: "Email verified", token });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Forgot Password
export const forgotPassword = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				success: false,
				message: "Email is required",
				code: "EMAIL_REQUIRED",
			});
		}

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "No account found with this email",
				code: "USER_NOT_FOUND",
			});
		}

		// Generate OTP
		const otp = Math.floor(100000 + Math.random() * 900000);

		user.resetOtp = otp;
		user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 mins
		await user.save();

		// Send email
		await sendEmail({
			to: email,
			subject: "Password Reset OTP",
			html: `<p>Your password reset OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
		});

		res.status(200).json({ message: "Reset OTP sent to email" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Verify Reset OTP
export const verifyResetOtp = async (req, res) => {
	try {
		const { email, otp } = req.body;

		if (!email || !otp) {
			return res.status(400).json({
				success: false,
				message: "Email and OTP are required",
				code: "MISSING_FIELDS",
			});
		}

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
				code: "USER_NOT_FOUND",
			});
		}

		if (user.resetOtp !== Number(otp) || Date.now() > user.resetOtpExpires) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired OTP",
				code: "INVALID_OTP",
			});
		}

		// Mark OTP as verified (important)
		user.resetOtpVerified = true;
		await user.save();

		res.status(200).json({ message: "OTP verified successfully" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Reset Password (after OTP verification)
export const resetPassword = async (req, res) => {
	try {
		const { email, newPassword } = req.body;

		if (!email || !newPassword) {
			return res.status(400).json({
				success: false,
				message: "Email and new password are required",
				code: "MISSING_FIELDS",
			});
		}

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
				code: "USER_NOT_FOUND",
			});
		}

		// Ensure OTP was verified first
		if (!user.resetOtpVerified) {
			return res.status(401).json({
				success: false,
				message: "OTP verification required before resetting password",
				code: "OTP_NOT_VERIFIED",
			});
		}

		const hashedPassword = await bcrypt.hash(newPassword, 10);

		user.password = hashedPassword;

		// Clear reset fields
		user.resetOtp = undefined;
		user.resetOtpExpires = undefined;
		user.resetOtpVerified = undefined;

		await user.save();

		res.status(200).json({ message: "Password reset successful" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
// Step 3: Complete onboarding journey
export const completeOnboarding = async (req, res) => {
	try {
		const {
			financialGoal,
			incomeType,
			incomeFrequency,
			financialChallenges,
			trackingHabit,
			bankConnections,
		} = req.body;

		// req.user is set by the protect middleware
		if (!req.user || !req.user._id) {
			return res.status(401).json({
				success: false,
				message: "Authentication required",
				code: "UNAUTHORIZED",
			});
		}

		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
				code: "USER_NOT_FOUND",
			});
		}

		user.onboarding = {
			...user.onboarding,
			financialGoals: financialGoal,
			incomeType,
			incomeFrequency,
			financialChallenges,
			expenseTrackingHabit: trackingHabit,
		};

		user.onboardingCompleted = true;
		await user.save();

		// Save optional bank connections
		if (bankConnections && bankConnections.length > 0) {
			const connections = bankConnections.map((b) => ({
				userId: user._id,
				provider: b.provider,
				accountName: b.accountName,
				accountNumber: b.accountNumber,
				bankName: b.bankName,
				status: "Active",
				lastSync: null,
			}));
			await BankConnection.insertMany(connections);

			// Update user's onboarding.connectedAccounts

			user.onboarding.connectedAccounts = true;
			await user.save();
		}

		res.status(200).json({ message: "Onboarding complete", user });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

// Login
export const login = async (req, res) => {
	try {
		const { email, password } = req.body;
		const user = await User.findOne({ email });
		if (!user) return res.status(400).json({ error: "Invalid credentials" });

		const isMatch = await bcrypt.compare(password, user.password);

		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: "Invalid email or password",
				code: "INVALID_CREDENTIALS",
			});
		}

		if (!user.isVerified) {
			return res.status(403).json({
				success: false,
				message: "Please verify your email before logging in",
				code: "EMAIL_NOT_VERIFIED",
			});
		}
		const token = generateToken(user._id);
		res.status(200).json({ token, user });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

export const socialAuth = async (req, res) => {
	try {
		const { idToken } = req.body;

		if (!idToken) {
			return res.status(400).json({
				success: false,
				message: "Authentication token is required",
				code: "TOKEN_REQUIRED",
			});
		}

		const decoded = await verifyFirebaseToken(idToken);

		const { email, name, uid, firebase } = decoded;

		let user = await User.findOne({ email });

		if (!user) {
			user = await User.create({
				fullName: name || "User",
				email,
				firebaseUid: uid,
				provider: firebase.sign_in_provider,
				isVerified: true,
			});

			await initializeDefaultCategories(user._id);

			await Wallet.create({
				userId: user._id,
			});
		}

		const token = generateToken(user._id);

		res.status(200).json({
			token,
			user,
			firstLogin: !user.onboardingCompleted, // Indicate if user needs to complete onboarding
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
