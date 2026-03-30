// services/dvaService.js
import axios from "axios";
import User from "../models/User.js";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// ================= BVN VERIFICATION =================

// Verify BVN with Paystack
export const verifyBVN = async (bvn, user) => {
	try {
		console.log(`Verifying BVN for user: ${user._id}`);

		// For test mode, use test credentials
		if (process.env.NODE_ENV !== "production") {
			console.log("Using test mode for BVN verification");

			// Test BVNs that Paystack accepts
			const testBVNs = ["222222222221", "12345678901", "200123456677"];

			if (testBVNs.includes(bvn)) {
				return {
					success: true,
					data: {
						bvn: bvn,
						first_name: user.fullName?.split(" ")[0] || "Test",
						last_name: user.fullName?.split(" ")[1] || "User",
						verified: true,
					},
					message: "BVN verified successfully (test mode)",
				};
			} else {
				return {
					success: false,
					message:
						"Invalid test BVN. Use one of: 222222222221, 12345678901, 200123456677",
				};
			}
		}

		// Production: Use Paystack's BVN verification endpoint
		// Note: Paystack uses the customer identification endpoint for BVN verification
		// First, we need to create a customer before verifying BVN
		let customerCode;

		// Try to find existing customer
		try {
			const searchResponse = await axios.get(`${PAYSTACK_BASE_URL}/customer`, {
				params: { email: user.email },
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
				},
			});

			if (searchResponse.data.data && searchResponse.data.data.length > 0) {
				customerCode = searchResponse.data.data[0].customer_code;
			}
		} catch (error) {
			console.log("Customer not found for BVN verification");
		}

		// Create customer if not exists
		if (!customerCode) {
			const createResponse = await axios.post(
				`${PAYSTACK_BASE_URL}/customer`,
				{
					email: user.email,
					first_name: user.fullName?.split(" ")[0] || "User",
					last_name: user.fullName?.split(" ")[1] || "Account",
					phone: user.phoneNumber || "08000000000",
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
			} else {
				throw new Error("Failed to create customer for BVN verification");
			}
		}

		// Validate the customer with BVN
		// Note: This requires a bank account connected to the BVN
		const validationResponse = await axios.post(
			`${PAYSTACK_BASE_URL}/customer/${customerCode}/identification`,
			{
				country: "NG",
				type: "bank_account",
				account_number: "0111111111", // This should be the user's actual account number
				bvn: bvn,
				bank_code: "007", // This should be the user's actual bank code
				first_name: user.fullName?.split(" ")[0] || "",
				last_name: user.fullName?.split(" ")[1] || "",
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (validationResponse.data.status) {
			return {
				success: true,
				data: validationResponse.data.data,
				message: "BVN verification initiated. Customer validation pending.",
			};
		} else {
			return {
				success: false,
				message: validationResponse.data.message || "BVN verification failed",
			};
		}
	} catch (error) {
		console.error(
			"BVN verification error:",
			error.response?.data || error.message,
		);
		return {
			success: false,
			message: error.response?.data?.message || "BVN verification failed",
		};
	}
};

// ================= KYC CHECK =================

// Check if user has completed KYC
export const hasCompletedKYC = async (userId) => {
	const user = await User.findById(userId);
	if (!user) return false;

	return !!(
		user.kyc?.isVerified &&
		user.kyc.bvn &&
		user.kyc.bvnVerified &&
		user.kyc.dateOfBirth &&
		user.kyc.address?.street &&
		user.kyc.address?.city &&
		user.kyc.address?.state &&
		user.kyc.identification?.type &&
		user.kyc.identification?.number
	);
};

// ================= CUSTOMER VALIDATION =================

// Validate customer with Paystack (BVN + Bank Account)
export const validateCustomer = async (customerCode, user) => {
	try {
		console.log(`Validating customer: ${customerCode} for user: ${user._id}`);

		// Get the user's bank account (you need to have a bank account connected)
		const bankAccount = user.bankAccounts && user.bankAccounts[0];

		if (!bankAccount && process.env.NODE_ENV !== "production") {
			// Use test credentials for development
			console.log("Using test credentials for BVN validation");
			const validationResponse = await axios.post(
				`${PAYSTACK_BASE_URL}/customer/${customerCode}/identification`,
				{
					country: "NG",
					type: "bank_account",
					account_number: "0111111111", // Test account number
					bvn: "222222222221", // Test BVN
					bank_code: "007", // Test bank code (Fidelity Bank)
					first_name: user.fullName?.split(" ")[0] || "Test",
					last_name: user.fullName?.split(" ")[1] || "User",
				},
				{
					headers: {
						Authorization: `Bearer ${PAYSTACK_SECRET}`,
						"Content-Type": "application/json",
					},
				},
			);

			console.log("Customer validation initiated:", validationResponse.data);

			return {
				success: true,
				pending: true,
				message: "Customer validation initiated. Waiting for verification...",
			};
		}

		// Production: Use actual user bank account
		if (bankAccount && bankAccount.accountNumber && bankAccount.bankCode) {
			const validationResponse = await axios.post(
				`${PAYSTACK_BASE_URL}/customer/${customerCode}/identification`,
				{
					country: "NG",
					type: "bank_account",
					account_number: bankAccount.accountNumber,
					bvn: user.kyc?.bvn,
					bank_code: bankAccount.bankCode,
					first_name: user.fullName?.split(" ")[0] || "",
					last_name: user.fullName?.split(" ")[1] || "",
				},
				{
					headers: {
						Authorization: `Bearer ${PAYSTACK_SECRET}`,
						"Content-Type": "application/json",
					},
				},
			);

			console.log("Customer validation initiated:", validationResponse.data);

			return {
				success: true,
				pending: true,
				message: "Customer validation initiated. Waiting for verification...",
			};
		}

		return {
			success: false,
			message:
				"No bank account found for validation. Please link a bank account.",
		};
	} catch (error) {
		console.error(
			"Customer validation error:",
			error.response?.data || error.message,
		);
		return {
			success: false,
			message: error.response?.data?.message || "Customer validation failed",
		};
	}
};

// ================= VIRTUAL ACCOUNT CREATION =================

// services/dvaService.js - Update createVirtualAccount to handle pending validation

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

		// Step 1: Get or create customer in Paystack
		let customerCode;

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
					first_name: user.fullName?.split(" ")[0] || "User",
					last_name: user.fullName?.split(" ")[1] || "Account",
					phone: user.phoneNumber || "08000000000",
					metadata: {
						userId: user._id.toString(),
						bvn: user.kyc?.bvn,
						date_of_birth: user.kyc?.dateOfBirth,
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
				console.log(`Created new customer: ${customerCode}`);
			} else {
				throw new Error("Failed to create customer");
			}
		}

		// Step 2: Check if customer is already validated
		const userRecord = await User.findById(user._id);

		// If already validated, proceed to create virtual account
		if (userRecord.kyc?.paystackValidated) {
			console.log(
				"Customer already validated, proceeding to create virtual account",
			);

			// Step 3: Get available banks
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

			// Step 4: Create dedicated virtual account
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
		}

		// If validation is pending, don't retry validation - just return pending status
		if (userRecord.kyc?.paystackValidationPending) {
			console.log("Customer validation pending, waiting for webhook");
			return {
				success: false,
				pendingValidation: true,
				message:
					"Customer validation pending. Please wait for verification (this may take a few minutes).",
			};
		}

		// If not validated and not pending, initiate validation
		console.log("Customer not validated, initiating validation...");
		const validationResult = await validateCustomer(customerCode, user);

		if (!validationResult.success) {
			return {
				success: false,
				requiresKYC: true,
				error: validationResult.message,
			};
		}

		// Mark that validation is pending
		userRecord.kyc.paystackValidated = false;
		userRecord.kyc.paystackValidationPending = true;
		await userRecord.save();

		return {
			success: false,
			pendingValidation: true,
			message:
				"Customer validation initiated. Please wait for verification (this may take a few minutes).",
		};
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

// ================= VIRTUAL ACCOUNT MANAGEMENT =================

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

// ================= WEBHOOK HANDLER =================

// Webhook handler for customer identification events
export const handleCustomerIdentificationWebhook = async (event, data) => {
	try {
		if (event === "customeridentification.success") {
			const { customer_code } = data;

			// Find user by customer_code
			const virtualAccount = await userVirtualAccount.findOne({
				customerCode: customer_code,
			});

			if (virtualAccount) {
				const user = await User.findById(virtualAccount.userId);
				if (user) {
					user.kyc.paystackValidated = true;
					user.kyc.paystackValidationPending = false;
					user.kyc.isVerified = true;
					user.kyc.verifiedAt = new Date();
					await user.save();

					console.log(`✅ Customer ${customer_code} validated successfully`);
				}
			}
		} else if (event === "customeridentification.failed") {
			const { customer_code, reason } = data;

			const virtualAccount = await userVirtualAccount.findOne({
				customerCode: customer_code,
			});

			if (virtualAccount) {
				const user = await User.findById(virtualAccount.userId);
				if (user) {
					user.kyc.paystackValidationPending = false;
					user.kyc.validationError = reason;
					await user.save();

					console.log(
						`❌ Customer ${customer_code} validation failed: ${reason}`,
					);
				}
			}
		}
	} catch (error) {
		console.error("Webhook handling error:", error);
	}
};
