// services/dvaService.js
import axios from "axios";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Create a dedicated virtual account for a user
export const createVirtualAccount = async (user) => {
	try {
		console.log(`Creating virtual account for user: ${user._id}`);

		// Use Wema Bank instead of paystack-titan
		const response = await axios.post(
			`${PAYSTACK_BASE_URL}/dedicated_account`,
			{
				customer: user.email,
				phone: user.phone || "08000000000",
				first_name: user.firstName || user.name?.split(" ")[0] || "User",
				last_name: user.lastName || user.name?.split(" ")[1] || "Account",
				preferred_bank: "wema", // Change from "paystack-titan" to "wema"
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
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
		console.error(
			"Create virtual account error:",
			error.response?.data || error.message,
		);

		// Provide a user-friendly error
		throw new Error(
			"Virtual account service is currently unavailable. Please use card payment instead.",
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
