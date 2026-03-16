import axios from "axios";

export const createTopUp = async ({ email, amount, reference }) => {
	try {
		const response = await axios.post(
			"https://api.paystack.co/transaction/initialize",
			{
				email,
				amount: amount * 100, // convert to kobo
				reference,
				callback_url: "https://kuditrak.ng/payment/verify",
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

export const verifyTopUp = async (reference) => {
	try {
		const response = await axios.get(
			`https://api.paystack.co/transaction/verify/${reference}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
				},
			},
		);

		return response.data;
	} catch (error) {
		throw new Error("Payment verification failed");
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
