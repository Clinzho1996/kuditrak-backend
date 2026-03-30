// services/dvaService.js
import axios from "axios";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Check available DVA banks
export const getAvailableBanks = async () => {
	try {
		const response = await axios.get(
			`${PAYSTACK_BASE_URL}/dedicated_account/available_banks`,
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
export const createVirtualAccount = async (user) => {
	try {
		console.log(`Creating virtual account for user: ${user._id}`);

		// Try with Wema Bank first (most reliable)
		const banksToTry = ["wema", "paystack-titan"];
		let lastError = null;

		for (const bank of banksToTry) {
			try {
				console.log(`Attempting to create account with bank: ${bank}`);

				const response = await axios.post(
					`${PAYSTACK_BASE_URL}/dedicated_account`,
					{
						customer: user.email,
						phone: user.phone || "08000000000",
						first_name: user.firstName || user.name?.split(" ")[0] || "User",
						last_name: user.lastName || user.name?.split(" ")[1] || "Account",
						preferred_bank: bank,
					},
					{
						headers: {
							Authorization: `Bearer ${PAYSTACK_SECRET}`,
							"Content-Type": "application/json",
						},
						timeout: 10000, // 10 second timeout
					},
				);

				const data = response.data.data;

				// Create virtual account record
				const virtualAccount = await userVirtualAccount.create({
					userId: user._id,
					accountNumber: data.account_number,
					bankName: data.bank.name,
					accountName: data.account_name,
					provider: data.provider,
					customerCode: data.customer.customer_code,
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
					provider: data.provider,
					virtualAccount,
				};
			} catch (error) {
				lastError = error;
				console.error(
					`Failed with bank ${bank}:`,
					error.response?.data?.message || error.message,
				);

				// Continue to next bank if this one failed
				if (error.response?.data?.message?.includes("not available")) {
					console.log(`${bank} not available, trying next...`);
					continue;
				}

				// If it's a different error, we might still want to try next bank
				if (error.response?.data?.type === "api_error") {
					console.log(`${bank} API error, trying next...`);
					continue;
				}
			}
		}

		// If we get here, all banks failed
		console.error("All banks failed to create virtual account");
		throw new Error(
			lastError?.response?.data?.message ||
				"No virtual account providers available",
		);
	} catch (error) {
		console.error(
			"Create virtual account error:",
			error.response?.data || error.message,
		);

		// Provide a user-friendly error message
		if (error.message === "No virtual account providers available") {
			throw new Error(
				"Virtual account service is currently unavailable. Please use card payment instead.",
			);
		}

		throw new Error(
			"Failed to create virtual account. Please try card payment.",
		);
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
		// Return a failure object instead of throwing
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
