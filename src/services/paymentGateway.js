import axios from "axios";
import Wallet from "../models/Wallet";

export const createTopUp = async ({ email, amount, reference }) => {
	try {
		const response = await axios.post(
			"https://api.paystack.co/transaction/initialize",
			{
				email,
				amount: amount * 100, // convert to kobo
				reference,
				callback_url: "https://kuditrak.com/payment/verify",
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		return {
			paymentLink: response.data.data.authorization_url,
			reference: response.data.data.reference,
		};
	} catch (error) {
		throw new Error("Failed to initialize Paystack transaction");
	}
};

export const verifyTopup = async (req, res) => {
	try {
		const { reference } = req.query;
		
		console.log('Paystack callback received for reference:', reference);

		// Verify with Paystack
		const response = await axios.get(
			`https://api.paystack.co/transaction/verify/${reference}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
				},
			}
		);

		const { data } = response.data;
		
		if (data.status === 'success') {
			console.log('Payment verified successfully:', reference);
			
			// Update transaction status
			await Transaction.findOneAndUpdate(
				{ reference: reference },
				{ status: 'success', metadata: data }
			);

			// Update wallet balance
			const userId = data.metadata.userId;
			const wallet = await Wallet.findOne({ userId: userId });
			
			if (wallet) {
				wallet.balance += data.amount / 100;
				await wallet.save();
				console.log('Wallet updated:', wallet.balance);
			}

			// Now redirect to APP DEEP LINK (NOT backend again)
			const amount = data.amount / 100;
			const appDeepLink = `kuditrak://payment/success?reference=${reference}&amount=${amount}`;
			
			console.log('Redirecting to app:', appDeepLink);
			
			// Redirect to app deep link
			return res.redirect(appDeepLink);
		} else {
			throw new Error('Payment verification failed');
		}
	} catch (error) {
		console.error('Verify topup error:', error.response?.data || error.message);
		
		// Redirect to app with failure
		const appDeepLink = `kuditrak://payment/failed?reference=${reference}`;
		return res.redirect(appDeepLink);
	}
};

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

// Create a payout to a user bank account
export const initiatePayout = async ({
	amount,
	userId,
	bankAccountId,
	reference,
}) => {
	try {
		// Paystack requires amount in kobo (multiply by 100)
		const koboAmount = Number(amount) * 100;

		const response = await axios.post(
			"https://api.paystack.co/transfer",
			{
				source: "balance",
				reason: "Wallet withdrawal",
				amount: koboAmount,
				recipient: bankAccountId, // must be created via Paystack Transfer Recipient
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
				amount: selectedPlan.amount * 100, // convert to kobo
				reference,
				callback_url: "https://kuditrak.com/subscription/verify",
				metadata: {
					type: "subscription",
					plan,
					userId,
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
export const verifySubscriptionPayment = async (reference) => {
	try {
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
			return {
				success: false,
				message: "Payment not successful",
			};
		}

		const metadata = data.metadata || {};
		const plan = metadata.plan;
		const userId = metadata.userId;

		if (!PLANS[plan]) {
			throw new Error("Invalid plan in metadata");
		}

		return {
			success: true,
			plan,
			userId,
			amount: data.amount / 100, // convert back from kobo
			reference: data.reference,
			paidAt: data.paid_at,
		};
	} catch (error) {
		console.error(
			"Verify Subscription Error:",
			error.response?.data || error.message,
		);
		throw new Error("Subscription verification failed");
	}
};
