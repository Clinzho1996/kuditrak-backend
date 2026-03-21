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
	firebaseUid: String, // For Firebase Authentication users

	// Push notifications
	pushToken: String,

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

	// User budgets
	budgets: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Budget",
		},
	],

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

// Transform JSON output to hide sensitive fields
userSchema.set("toJSON", {
	transform: (doc, ret, options) => {
		delete ret.password;
		delete ret.otp;
		delete ret.otpExpires;
		return ret;
	},
});

export default mongoose.model("User", userSchema);
