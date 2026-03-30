// services/dvaService.js
import axios from "axios";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Create a dedicated virtual account for a user
export const createVirtualAccount = async (user) => {
	try {
		console.log(`Creating virtual account for user: ${user._id}`);

		const response = await axios.post(
			`${PAYSTACK_BASE_URL}/dedicated_account`,
			{
				customer: user.email,
				phone: user.phone || "08000000000",
				first_name: user.firstName || user.name?.split(" ")[0] || "User",
				last_name: user.lastName || user.name?.split(" ")[1] || "Account",
				preferred_bank: "paystack-titan", // Options: "paystack-titan", "wema"
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
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
			`Virtual account created: ${data.account_number} for user ${user._id}`,
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
		throw new Error("Failed to create virtual account");
	}
};

// Get user's virtual account
export const getUserVirtualAccount = async (userId) => {
	try {
		const virtualAccount = await UserVirtualAccount.findOne({
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
	let virtualAccount = await getUserVirtualAccount(user._id);

	if (!virtualAccount) {
		virtualAccount = await createVirtualAccount(user);
	}

	return virtualAccount;
};

// Deactivate virtual account
export const deactivateVirtualAccount = async (userId) => {
	try {
		await UserVirtualAccount.updateOne(
			{ userId, isActive: true },
			{ isActive: false, updatedAt: new Date() },
		);
		return { success: true };
	} catch (error) {
		console.error("Deactivate virtual account error:", error);
		return { success: false };
	}
};
