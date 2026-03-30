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

// Create a dedicated virtual account for a user using the assign endpoint
export const createVirtualAccount = async (user) => {
	try {
		console.log(`Creating virtual account for user: ${user._id}`);

		// First, get available banks
		const availableBanks = await getAvailableBanks();

		// Get the first available bank slug
		let preferredBank = null;
		if (availableBanks.length > 0) {
			preferredBank = availableBanks[0].provider_slug;
			console.log(`Using available bank: ${preferredBank}`);
		} else {
			preferredBank = "wema-bank"; // Fallback
		}

		// Use the /assign endpoint instead of /dedicated_account
		// This endpoint creates a customer and assigns a DVA in one go
		const response = await axios.post(
			`${PAYSTACK_BASE_URL}/dedicated_account/assign`,
			{
				email: user.email,
				first_name: user.firstName || user.name?.split(" ")[0] || "User",
				last_name: user.lastName || user.name?.split(" ")[1] || "Account",
				phone: user.phone || "08000000000",
				preferred_bank: preferredBank,
				country: "NG",
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
				timeout: 15000,
			},
		);

		console.log("Assign DVA response:", response.data);

		// The assign endpoint returns a message that the account is being created
		// We need to wait a bit and then fetch the account details
		if (response.data.status) {
			// Wait 2 seconds for the account to be created
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Fetch the created virtual account
			const fetchResponse = await axios.get(
				`${PAYSTACK_BASE_URL}/dedicated_account?customer=${user.email}`,
				{
					headers: {
						Authorization: `Bearer ${PAYSTACK_SECRET}`,
					},
				},
			);

			const accounts = fetchResponse.data.data;
			if (accounts && accounts.length > 0) {
				const account = accounts[0];

				// Create virtual account record
				const virtualAccount = await userVirtualAccount.create({
					userId: user._id,
					accountNumber: account.account_number,
					bankName: account.bank.name,
					accountName: account.account_name,
					provider: account.bank.slug,
					customerCode: account.customer?.customer_code,
					isActive: true,
				});

				console.log(
					`✅ Virtual account created: ${account.account_number} (${account.bank.name}) for user ${user._id}`,
				);

				return {
					success: true,
					accountNumber: account.account_number,
					bankName: account.bank.name,
					accountName: account.account_name,
					provider: account.bank.slug,
					virtualAccount,
				};
			}
		}

		throw new Error("Failed to create virtual account");
	} catch (error) {
		console.error(
			"Create virtual account error:",
			error.response?.data || error.message,
		);

		// Check if error is about customer identification
		if (error.response?.data?.message?.includes("identified")) {
			console.log(
				"Customer needs identification - this may require BVN verification",
			);
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
