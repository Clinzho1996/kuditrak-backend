// backend/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
	fullName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	phoneNumber: {
		type: String,
		default: null,
		trim: true,
	},
	password: {
		type: String,
		required: function () {
			return this.provider === "local";
		},
	},

	// KYC Fields for DVA
	kyc: {
		bvn: { type: String, default: null },
		dateOfBirth: { type: Date, default: null },
		bvnVerified: { type: Boolean, default: false },
		bvnVerificationData: { type: mongoose.Schema.Types.Mixed, default: null },
		address: {
			street: { type: String, default: null },
			city: { type: String, default: null },
			state: { type: String, default: null },
			country: { type: String, default: "NG" },
		},
		identification: {
			type: {
				type: String,
				enum: ["nin", "passport", "driver_license"],
				default: null,
			},
			number: { type: String, default: null },
			imageUrl: { type: String, default: null },
		},
		isVerified: { type: Boolean, default: false },
		verifiedAt: { type: Date, default: null },
	},

	// Onboarding journey
	onboarding: {
		financialGoals: [String],
		incomeType: String,
		incomeFrequency: String,
		financialChallenges: [String],
		expenseTrackingHabit: String,
		connectedAccounts: { type: Boolean, default: false },
	},
	onboardingCompleted: {
		type: Boolean,
		default: false,
	},
	provider: {
		type: String,
		enum: ["local", "google", "apple", "google.com", "apple.com", "custom"],
		default: "local",
	},
	monoCustomerId: {
		type: String,
		default: null,
	},
	firebaseUid: String,

	pushTokens: {
		type: [
			{
				token: { type: String, required: true },
				platform: { type: String, enum: ["ios", "android"], required: true },
				deviceId: { type: mongoose.Schema.Types.Mixed, default: null },
				lastUsed: { type: Date, default: Date.now },
				createdAt: { type: Date, default: Date.now },
			},
		],
		default: [],
	},

	// Profile image
	profileImage: String,

	// Soft delete reason
	deletedReason: String,

	// Account verification
	isVerified: { type: Boolean, default: false },
	otp: Number,
	otpExpires: Date,
	resetOtp: Number,
	resetOtpExpires: Date,
	resetOtpVerified: Boolean,

	subscription: {
		plan: {
			type: String,
			enum: ["free", "basic", "pro"],
			default: "free",
		},
		startDate: Date,
		endDate: Date,
		status: {
			type: String,
			enum: ["active", "expired"],
			default: "active",
		},
	},

	notificationSettings: {
		push_enabled: { type: Boolean, default: true },
		email_enabled: { type: Boolean, default: true },
		budget_alerts: { type: Boolean, default: true },
		savings_goals: { type: Boolean, default: true },
		subscriptions: { type: Boolean, default: true },
		transactions: { type: Boolean, default: true },
		promotions: { type: Boolean, default: false },
	},
	isAdmin: { type: Boolean, default: false },

	appleUserId: {
		type: String,
		unique: true,
		sparse: true,
		index: true,
	},
	isSuspended: { type: Boolean, default: false },
	suspendedAt: { type: Date, default: null },
	suspensionReason: { type: String, default: null },

	budgets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Budget" }],

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Transform JSON output to hide sensitive fields
userSchema.set("toJSON", {
	transform: (doc, ret, options) => {
		delete ret.password;
		delete ret.otp;
		delete ret.otpExpires;
		delete ret.kyc?.bvn; // Hide BVN for security
		delete ret.kyc?.identification?.number;
		return ret;
	},
});

export default mongoose.model("User", userSchema);
