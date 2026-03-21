// backend/services/paymentGateway.js
import axios from "axios";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const BACKEND_URL =
	process.env.BACKEND_URL || "https://kuditrak-backend.onrender.com";

export const createTopUp = async ({ email, amount, reference, userId }) => {
	try {
		console.log("Creating Paystack transaction for:", {
			email,
			amount,
			reference,
			userId,
		});

		const response = await axios.post(
			"https://api.paystack.co/transaction/initialize",
			{
				email,
				amount: amount * 100,
				reference,
				callback_url: `${BACKEND_URL}/api/wallet/verify`, // BACKEND endpoint
				metadata: {
					userId: userId.toString(),
					amount: amount,
					type: "topup",
				},
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		console.log("Paystack response:", response.data);

		return {
			paymentLink: response.data.data.authorization_url,
			reference: response.data.data.reference,
		};
	} catch (error) {
		console.error(
			"Paystack initialize error:",
			error.response?.data || error.message,
		);
		throw new Error(
			error.response?.data?.message ||
				"Failed to initialize Paystack transaction",
		);
	}
};

export const verifyTopup = async (req, res) => {
	try {
		const { reference } = req.query;

		console.log("🔔 Paystack callback received for reference:", reference);

		if (!reference) {
			console.error("No reference provided in callback");
			return res.redirect("kuditrak://payment/failed?error=missing_reference");
		}

		// Verify with Paystack
		const verificationResponse = await axios.get(
			`https://api.paystack.co/transaction/verify/${reference}`,
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			},
		);

		const { data } = verificationResponse.data;

		console.log("Paystack verification result:", {
			status: data.status,
			reference: data.reference,
		});

		if (data.status === "success") {
			// Find transaction
			const transaction = await Transaction.findOne({ reference });

			if (!transaction) {
				console.error("Transaction not found for reference:", reference);
				return res.redirect(
					"kuditrak://payment/failed?error=transaction_not_found",
				);
			}

			// Update transaction
			transaction.status = "success";
			transaction.metadata = data;
			await transaction.save();

			// Update wallet balance
			const wallet = await Wallet.findOne({ userId: transaction.userId });

			if (wallet) {
				const amountAdded = data.amount / 100;
				wallet.balance += amountAdded;
				await wallet.save();
				console.log(
					`✅ Wallet updated: +₦${amountAdded}, New balance: ₦${wallet.balance}`,
				);
			}

			// Redirect to app deep link
			const amount = data.amount / 100;
			const appDeepLink = `kuditrak://payment/success?reference=${reference}&amount=${amount}`;
			console.log("🔗 Redirecting to app:", appDeepLink);

			return res.redirect(appDeepLink);
		} else {
			console.error(
				"Payment verification failed - status not success:",
				data.status,
			);
			return res.redirect(
				`kuditrak://payment/failed?reference=${reference}&error=verification_failed`,
			);
		}
	} catch (error) {
		console.error("Verify topup error:", error.response?.data || error.message);
		const reference = req.query?.reference || "unknown";
		return res.redirect(
			`kuditrak://payment/failed?reference=${reference}&error=${encodeURIComponent(error.message)}`,
		);
	}
};

// Create a payout to a user bank account
export const initiatePayout = async ({
	amount,
	userId,
	bankAccountId,
	reference,
}) => {
	try {
		const koboAmount = Number(amount) * 100;

		const response = await axios.post(
			"https://api.paystack.co/transfer",
			{
				source: "balance",
				reason: "Wallet withdrawal",
				amount: koboAmount,
				recipient: bankAccountId,
				reference,
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		return {
			success: response.data.status,
			message: response.data.message,
			data: response.data.data,
		};
	} catch (err) {
		console.error("Payout error:", err.response?.data || err.message);
		return {
			success: false,
			message: err.response?.data?.message || err.message,
		};
	}
};

// ===============================
// PLAN CONFIG
// ===============================
const PLANS = {
	basic: {
		amount: 3000,
		name: "Basic Plan",
	},
	pro: {
		amount: 5000,
		name: "Pro Plan",
	},
};

// ===============================
// INITIATE SUBSCRIPTION PAYMENT
// ===============================
export const initializeSubscriptionPayment = async ({
	email,
	plan,
	userId,
}) => {
	try {
		if (!PLANS[plan]) {
			throw new Error("Invalid subscription plan");
		}

		const selectedPlan = PLANS[plan];
		const reference = `sub_${plan}_${userId}_${Date.now()}`;

		const response = await axios.post(
			"https://api.paystack.co/transaction/initialize",
			{
				email,
				amount: selectedPlan.amount * 100,
				reference,
				callback_url: `${BACKEND_URL}/api/subscription/verify`,
				metadata: {
					type: "subscription",
					plan,
					userId: userId.toString(),
				},
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		return {
			paymentLink: response.data.data.authorization_url,
			reference,
			plan,
			amount: selectedPlan.amount,
		};
	} catch (error) {
		console.error(
			"Initialize Subscription Error:",
			error.response?.data || error.message,
		);
		throw new Error("Failed to initialize subscription payment");
	}
};

// ===============================
// VERIFY SUBSCRIPTION PAYMENT
// ===============================
export const verifySubscriptionPayment = async (req, res) => {
	try {
		const { reference } = req.query;

		console.log("Subscription callback received for reference:", reference);

		const response = await axios.get(
			`https://api.paystack.co/transaction/verify/${reference}`,
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			},
		);

		const data = response.data.data;

		if (data.status !== "success") {
			return res.redirect(
				`kuditrak://subscription/failed?reference=${reference}`,
			);
		}

		const metadata = data.metadata || {};
		const plan = metadata.plan;
		const userId = metadata.userId;

		if (!PLANS[plan]) {
			throw new Error("Invalid plan in metadata");
		}

		// Update user subscription
		const User = await import("../models/User.js").then((m) => m.default);
		const user = await User.findById(userId);

		if (user) {
			const startDate = new Date();
			const endDate = new Date();

			if (plan === "basic") {
				endDate.setMonth(endDate.getMonth() + 1);
			} else if (plan === "pro") {
				endDate.setMonth(endDate.getMonth() + 3);
			}

			user.subscription = {
				plan: plan,
				status: "active",
				startDate: startDate,
				endDate: endDate,
			};
			await user.save();
		}

		const appDeepLink = `kuditrak://subscription/success?reference=${reference}&plan=${plan}`;
		console.log("Redirecting to app:", appDeepLink);

		return res.redirect(appDeepLink);
	} catch (error) {
		console.error("Verify Subscription Error:", error.message);
		return res.redirect(
			`kuditrak://subscription/failed?reference=${reference}`,
		);
	}
};
