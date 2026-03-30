// services/dvaService.js
import axios from "axios";
import User from "../models/User.js";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Check if user has completed KYC
export const hasCompletedKYC = async (userId) => {
	const user = await User.findById(userId);
	if (!user) return false;

	return !!(
		user.kyc?.isVerified &&
		user.kyc.bvn &&
		user.kyc.dateOfBirth &&
		user.kyc.address?.street &&
		user.kyc.identification?.type &&
		user.kyc.identification?.number
	);
};

// Create a dedicated virtual account for a user
export const createVirtualAccount = async (user) => {
	try {
		// Check if user has completed KYC
		const hasKYC = await hasCompletedKYC(user._id);
		if (!hasKYC) {
			return {
				success: false,
				requiresKYC: true,
				error: "KYC verification required to use bank transfer funding.",
			};
		}

		console.log(`Creating virtual account for user: ${user._id}`);

		// Step 1: Get or create customer in Paystack with KYC data
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

		// Create customer if not exists with KYC data
		if (!customerCode) {
			const createResponse = await axios.post(
				`${PAYSTACK_BASE_URL}/customer`,
				{
					email: user.email,
					first_name: user.fullName?.split(" ")[0] || "User",
					last_name: user.fullName?.split(" ")[1] || "Account",
					phone: user.phoneNumber || "08000000000",
					metadata: {
						bvn: user.kyc?.bvn,
						date_of_birth: user.kyc?.dateOfBirth,
						address: user.kyc?.address,
					},
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
				console.log(`Created new customer with KYC: ${customerCode}`);
			} else {
				throw new Error("Failed to create customer");
			}
		}

		// Step 2: Get available banks
		const banksResponse = await axios.get(
			`${PAYSTACK_BASE_URL}/dedicated_account/available_providers`,
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			},
		);

		const availableBanks = banksResponse.data.data || [];
		let preferredBank = "wema-bank";

		if (availableBanks.length > 0) {
			preferredBank = availableBanks[0].provider_slug;
		}

		console.log(`Using bank: ${preferredBank}`);

		// Step 3: Create dedicated virtual account
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

		if (dvaResponse.data.status) {
			const data = dvaResponse.data.data;

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
				`✅ Virtual account created: ${data.account_number} for user ${user._id}`,
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

		return {
			success: false,
			requiresKYC: false,
			error:
				"Virtual account service is currently unavailable. Please use card payment instead.",
		};
	}
};

// Get or create virtual account for user
export const getOrCreateVirtualAccount = async (user) => {
	try {
		// Check KYC first
		const hasKYC = await hasCompletedKYC(user._id);
		if (!hasKYC) {
			return {
				success: false,
				requiresKYC: true,
				error:
					"KYC verification required to use bank transfer funding. Please complete your profile verification.",
			};
		}

		let virtualAccount = await getUserVirtualAccount(user._id);

		if (!virtualAccount) {
			virtualAccount = await createVirtualAccount(user);
		}

		return virtualAccount;
	} catch (error) {
		console.error("Get or create virtual account error:", error.message);
		return {
			success: false,
			requiresKYC: false,
			error: error.message,
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
