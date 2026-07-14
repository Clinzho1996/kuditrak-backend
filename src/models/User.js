// backend/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
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
			bvnVerified: { type: Boolean, default: false },
			paystackCustomerCode: { type: String, default: null },
			paystackValidated: { type: Boolean, default: false },
			paystackValidationPending: { type: Boolean, default: false },
			validationError: { type: String, default: null },
			dateOfBirth: { type: Date, default: null },
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
			financialGoals: { type: [String], default: [] },
			incomeType: { type: String, default: "Not specified" },
			incomeFrequency: { type: String, default: "Not specified" },
			financialChallenges: { type: [String], default: [] },
			expenseTrackingHabit: { type: String, default: "Not specified" },
			connectedAccounts: { type: Boolean, default: false },
		},
		onboardingCompleted: {
			type: Boolean,
			default: false,
		},
		provider: {
			type: String,
			enum: [
				"local",
				"google",
				"apple",
				"google.com",
				"apple.com",
				"multi",
				"custom",
			],
			default: "local",
		},

		// ============================================================
		// APPLE SIGN-IN MIGRATION FIELDS
		// ============================================================
		connectedProviders: {
			type: [String],
			default: [],
			enum: ["local", "google", "apple", "google.com", "apple.com"],
		},

		appleUserId: {
			type: String,
			sparse: true,
		},

		oldAppleUserId: {
			type: String,
			sparse: true,
		},

		transferIdentifier: {
			type: String,
			sparse: true,
		},

		migrationCompleted: {
			type: Boolean,
			default: false,
		},
		migrationCompletedAt: {
			type: Date,
			default: null,
		},
		// ============================================================

		monoCustomerId: {
			type: String,
			default: null,
		},
		firebaseUid: {
			type: String,
			unique: true,
			sparse: true,
		},

		pushTokens: {
			type: [
				{
					token: { type: String, required: false },
					platform: { type: String, enum: ["ios", "android"], required: false },
					deviceId: { type: mongoose.Schema.Types.Mixed, default: null },
					lastUsed: { type: Date, default: Date.now },
					createdAt: { type: Date, default: Date.now },
				},
			],
			default: [],
		},

		profileImage: String,
		deletedReason: String,

		isVerified: { type: Boolean, default: false },
		otp: Number,
		otpExpires: Date,
		resetOtp: Number,
		resetOtpExpires: Date,
		resetOtpVerified: Boolean,

		revenueCatAppUserId: {
			type: String,
			default: undefined,
			unique: true,
			sparse: true,
			index: true,
		},

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
			productId: String,
			revenueCatId: { type: String, default: null },
			lastSyncAt: Date,
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

		isSuspended: { type: Boolean, default: false },
		suspendedAt: { type: Date, default: null },
		suspensionReason: { type: String, default: null },

		budgets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Budget" }],

		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now },
	},
	{
		timestamps: true,
	},
);

// ============================================================
// INDEXES
// ============================================================
userSchema.index(
	{ email: 1, provider: 1 },
	{ unique: true, partialFilterExpression: { provider: { $ne: "local" } } },
);

userSchema.index({ appleUserId: 1 });
userSchema.index({ oldAppleUserId: 1 });
userSchema.index({ transferIdentifier: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ connectedProviders: 1 });
userSchema.index(
	{ transferIdentifier: 1, oldAppleUserId: 1 },
	{ sparse: true },
);

// ============================================================
// MIDDLEWARE - COMPLETELY REMOVED TO AVOID ERRORS
// ============================================================
// The timestamps: true option handles createdAt/updatedAt automatically
// We're removing all pre-save middleware to avoid the "next is not a function" error

// ============================================================
// INSTANCE METHODS
// ============================================================
userSchema.methods.hasProvider = function (provider) {
	if (!this.connectedProviders) return this.provider === provider;
	return (
		this.connectedProviders.includes(provider) || this.provider === provider
	);
};

userSchema.methods.isAppleUser = function () {
	return (
		this.provider === "apple" ||
		this.provider === "apple.com" ||
		this.hasProvider("apple") ||
		this.hasProvider("apple.com")
	);
};

userSchema.methods.isGoogleUser = function () {
	return (
		this.provider === "google" ||
		this.provider === "google.com" ||
		this.hasProvider("google") ||
		this.hasProvider("google.com")
	);
};

userSchema.methods.isMigrated = function () {
	return this.migrationCompleted === true;
};

userSchema.methods.needsMigration = function () {
	return (
		this.provider === "apple" ||
		this.provider === "apple.com" ||
		(this.appleUserId && !this.migrationCompleted)
	);
};

// ============================================================
// STATIC METHODS
// ============================================================
userSchema.statics.findByAppleIdentifier = async function (appleUserId) {
	if (!appleUserId) return null;

	let user = await this.findOne({ appleUserId: appleUserId });
	if (!user) {
		user = await this.findOne({ transferIdentifier: appleUserId });
	}
	if (!user) {
		user = await this.findOne({ oldAppleUserId: appleUserId });
	}
	return user;
};

userSchema.statics.findOrCreateAppleUser = async function ({
	appleUserId,
	transferIdentifier,
	email,
	fullName,
	firebaseUid,
}) {
	let user = await this.findByAppleIdentifier(
		appleUserId || transferIdentifier,
	);

	if (!user && email) {
		user = await this.findOne({ email: email });

		if (user) {
			if (appleUserId) {
				user.appleUserId = appleUserId;
			}
			if (transferIdentifier) {
				user.transferIdentifier = transferIdentifier;
				user.oldAppleUserId = transferIdentifier;
			}
			if (firebaseUid) {
				user.firebaseUid = firebaseUid;
			}

			if (!user.connectedProviders) {
				user.connectedProviders = [user.provider];
			}
			if (!user.connectedProviders.includes("apple.com")) {
				user.connectedProviders.push("apple.com");
			}
			if (user.connectedProviders.length > 1) {
				user.provider = "multi";
			}

			await user.save();
			return user;
		}
	}

	return user;
};

// ============================================================
// TO JSON TRANSFORM
// ============================================================
userSchema.set("toJSON", {
	transform: (doc, ret, options) => {
		delete ret.password;
		delete ret.otp;
		delete ret.otpExpires;
		delete ret.kyc?.bvn;
		delete ret.kyc?.identification?.number;

		ret.hasMigration = {
			completed: ret.migrationCompleted || false,
			hasOldAppleId: !!ret.oldAppleUserId,
			hasTransferId: !!ret.transferIdentifier,
		};

		ret.providers = {
			primary: ret.provider,
			connected: ret.connectedProviders || [ret.provider],
		};

		return ret;
	},
});

export default mongoose.model("User", userSchema);
