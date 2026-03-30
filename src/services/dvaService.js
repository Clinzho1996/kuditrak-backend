// services/dvaService.js
import axios from "axios";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Fetch available bank providers
export const getAvailableBanks = async () => {
	try {
		const response = await axios.get(
			`${PAYSTACK_BASE_URL}/dedicated_account/available_providers`,
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			},
		);

		console.log("Available DVA banks:", response.data.data);
		return response.data.data;
	} catch (error) {
		console.error(
			"Error fetching available banks:",
			error.response?.data || error.message,
		);
		return [];
	}
};

// Create a dedicated virtual account for a user
// Using the /customer endpoint first, then assign DVA
export const createVirtualAccount = async (user) => {
	try {
		console.log(`Creating virtual account for user: ${user._id}`);

		// Step 1: Create or get customer in Paystack
		let customerCode;

		// First, try to find existing customer
		try {
			const searchResponse = await axios.get(`${PAYSTACK_BASE_URL}/customer`, {
				params: { email: user.email },
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			});

			if (searchResponse.data.data && searchResponse.data.data.length > 0) {
				customerCode = searchResponse.data.data[0].customer_code;
				console.log(`Found existing customer: ${customerCode}`);
			}
		} catch (error) {
			console.log("Customer not found, will create new one");
		}

		// Create customer if not exists
		if (!customerCode) {
			const createResponse = await axios.post(
				`${PAYSTACK_BASE_URL}/customer`,
				{
					email: user.email,
					first_name: user.firstName || user.name?.split(" ")[0] || "User",
					last_name: user.lastName || user.name?.split(" ")[1] || "Account",
					phone: user.phone || "08000000000",
				},
				{
					headers: {
						Authorization: `Bearer ${PAYSTACK_SECRET}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (createResponse.data.status) {
				customerCode = createResponse.data.data.customer_code;
				console.log(`Created new customer: ${customerCode}`);
			} else {
				throw new Error("Failed to create customer");
			}
		}

		// Step 2: Get available banks and choose the first one
		const availableBanks = await getAvailableBanks();
		let preferredBank = "wema-bank";

		if (availableBanks.length > 0) {
			preferredBank = availableBanks[0].provider_slug;
		}

		console.log(`Using bank: ${preferredBank}`);

		// Step 3: Create dedicated virtual account for the customer
		const dvaResponse = await axios.post(
			`${PAYSTACK_BASE_URL}/dedicated_account`,
			{
				customer: customerCode,
				preferred_bank: preferredBank,
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
				timeout: 15000,
			},
		);

		console.log("DVA creation response:", dvaResponse.data);

		if (dvaResponse.data.status) {
			const data = dvaResponse.data.data;

			// Create virtual account record
			const virtualAccount = await userVirtualAccount.create({
				userId: user._id,
				accountNumber: data.account_number,
				bankName: data.bank.name,
				accountName: data.account_name,
				provider: data.bank.slug,
				customerCode: customerCode,
				isActive: true,
			});

			console.log(
				`✅ Virtual account created: ${data.account_number} (${data.bank.name}) for user ${user._id}`,
			);

			return {
				success: true,
				accountNumber: data.account_number,
				bankName: data.bank.name,
				accountName: data.account_name,
				provider: data.bank.slug,
				virtualAccount,
			};
		}

		throw new Error("Failed to create virtual account");
	} catch (error) {
		console.error(
			"Create virtual account error:",
			error.response?.data || error.message,
		);

		// Provide a user-friendly error message
		const errorMessage = error.response?.data?.message || error.message;

		if (errorMessage.includes("customer")) {
			console.log("Customer creation/retrieval failed");
		} else if (errorMessage.includes("bank")) {
			console.log("Bank selection failed");
		}

		return {
			success: false,
			error:
				"Virtual account service is currently unavailable. Please use card payment instead.",
		};
	}
};

// Get user's virtual account
export const getUserVirtualAccount = async (userId) => {
	try {
		const virtualAccount = await userVirtualAccount.findOne({
			userId,
			isActive: true,
		});
		return virtualAccount;
	} catch (error) {
		console.error("Get virtual account error:", error);
		return null;
	}
};

// Get or create virtual account for user
export const getOrCreateVirtualAccount = async (user) => {
	try {
		let virtualAccount = await getUserVirtualAccount(user._id);

		if (!virtualAccount) {
			virtualAccount = await createVirtualAccount(user);
		}

		return virtualAccount;
	} catch (error) {
		console.error("Get or create virtual account error:", error.message);
		return {
			success: false,
			error: error.message,
		};
	}
};

// Deactivate virtual account
export const deactivateVirtualAccount = async (userId) => {
	try {
		await userVirtualAccount.updateOne(
			{ userId, isActive: true },
			{ isActive: false, updatedAt: new Date() },
		);
		console.log(`Virtual account deactivated for user ${userId}`);
		return { success: true };
	} catch (error) {
		console.error("Deactivate virtual account error:", error);
		return { success: false };
	}
};

// Check if user has an active virtual account
export const hasActiveVirtualAccount = async (userId) => {
	try {
		const account = await userVirtualAccount.findOne({
			userId,
			isActive: true,
		});
		return !!account;
	} catch (error) {
		console.error("Check virtual account error:", error);
		return false;
	}
};
