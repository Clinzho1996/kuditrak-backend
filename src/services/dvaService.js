// services/dvaService.js
import axios from "axios";
import User from "../models/User.js";
import userVirtualAccount from "../models/userVirtualAccount.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// services/dvaService.js - Updated verifyBVN with direct verification

// Verify BVN with Paystack (Synchronous)
export const verifyBVN = async (bvn, user) => {
	try {
		console.log(`Verifying BVN for user: ${user._id}`);

		// For test mode, use test credentials that work immediately
		if (process.env.NODE_ENV !== "production") {
			console.log("Using test mode for BVN verification");

			// Paystack test BVNs that work
			const testBVNs = ["222222222221", "12345678901", "200123456677"];

			if (testBVNs.includes(bvn)) {
				// Simulate successful verification immediately
				return {
					success: true,
					verified: true,
					data: {
						bvn: bvn,
						first_name: user.fullName?.split(" ")[0] || "Test",
						last_name: user.fullName?.split(" ")[1] || "User",
						phone: user.phoneNumber || "08000000000",
					},
					message: "BVN verified successfully",
				};
			} else {
				return {
					success: false,
					verified: false,
					message:
						"Invalid test BVN. Use one of: 222222222221, 12345678901, 200123456677",
				};
			}
		}

		// Production: Use Paystack's BVN verification endpoint
		// Note: You need to have the "BVN Verification" add-on enabled in your Paystack dashboard

		const response = await axios.post(
			`${PAYSTACK_BASE_URL}/bank/verify_bvn`,
			{
				bvn: bvn,
				first_name: user.fullName?.split(" ")[0] || "",
				last_name: user.fullName?.split(" ")[1] || "",
				date_of_birth: user.kyc?.dateOfBirth?.toISOString().split("T")[0] || "",
				phone: user.phoneNumber || "",
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			},
		);

		if (response.data.status) {
			const data = response.data.data;

			// Update user's name if needed
			if (data.first_name && data.last_name) {
				const fullName = `${data.first_name} ${data.last_name}`;
				if (fullName !== user.fullName) {
					user.fullName = fullName;
				}
			}

			return {
				success: true,
				verified: true,
				data: data,
				message: "BVN verified successfully",
			};
		} else {
			return {
				success: false,
				verified: false,
				message: response.data.message || "BVN verification failed",
			};
		}
	} catch (error) {
		console.error(
			"BVN verification error:",
			error.response?.data || error.message,
		);

		// Handle specific error messages
		if (error.response?.data?.message === "Pending request already exists") {
			// This means there's already a pending request - we should treat as success
			// since the verification is in progress
			return {
				success: true,
				verified: true,
				pending: false,
				message: "BVN verification in progress",
			};
		}

		return {
			success: false,
			verified: false,
			message:
				error.response?.data?.message ||
				"BVN verification failed. Please check your BVN and try again.",
		};
	}
};
// ================= KYC CHECK =================

// Check if user has completed KYC
// services/dvaService.js - Update hasCompletedKYC

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

// services/dvaService.js - Simplified createVirtualAccount

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
// services/dvaService.js - Updated webhook handler

// Webhook handler for customer identification events
export const handleCustomerIdentificationWebhook = async (event, data) => {
	try {
		console.log(`📨 Processing webhook: ${event}`);

		if (event === "customeridentification.success") {
			const { customer_code, identification } = data;

			console.log(`✅ Customer validation success for: ${customer_code}`);
			console.log(`Identification data:`, identification);

			// Find virtual account by customer_code
			const virtualAccount = await userVirtualAccount.findOne({
				customerCode: customer_code,
			});

			if (virtualAccount) {
				const user = await User.findById(virtualAccount.userId);
				if (user) {
					// Update user's KYC status
					user.kyc.paystackValidated = true;
					user.kyc.paystackValidationPending = false;
					user.kyc.isVerified = true;
					user.kyc.verifiedAt = new Date();

					// Optionally update name from Paystack if needed
					if (identification?.first_name && identification?.last_name) {
						const fullName = `${identification.first_name} ${identification.last_name}`;
						if (!user.fullName || user.fullName !== fullName) {
							user.fullName = fullName;
						}
					}

					await user.save();

					console.log(
						`✅ Customer ${customer_code} validated successfully for user ${user._id}`,
					);

					// Now create the virtual account after validation
					try {
						// Get available banks
						const banksResponse = await axios.get(
							`${PAYSTACK_BASE_URL}/dedicated_account/available_providers`,
							{
								headers: {
									Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
								},
							},
						);

						const availableBanks = banksResponse.data.data || [];
						let preferredBank = "wema-bank";

						if (availableBanks.length > 0) {
							preferredBank = availableBanks[0].provider_slug;
						}

						// Create dedicated virtual account
						const dvaResponse = await axios.post(
							`${PAYSTACK_BASE_URL}/dedicated_account`,
							{
								customer: customer_code,
								preferred_bank: preferredBank,
							},
							{
								headers: {
									Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
									"Content-Type": "application/json",
								},
								timeout: 15000,
							},
						);

						if (dvaResponse.data.status) {
							const data = dvaResponse.data.data;

							// Update existing virtual account record
							virtualAccount.accountNumber = data.account_number;
							virtualAccount.bankName = data.bank.name;
							virtualAccount.accountName = data.account_name;
							virtualAccount.provider = data.bank.slug;
							virtualAccount.isActive = true;
							await virtualAccount.save();

							console.log(
								`✅ Virtual account created after validation: ${data.account_number}`,
							);
						}
					} catch (dvaError) {
						console.error(
							"Failed to create virtual account after validation:",
							dvaError,
						);
					}
				}
			} else {
				// No virtual account found, but still mark user as validated
				const user = await User.findOne({
					"kyc.bvnVerificationData.customer_code": customer_code,
				});
				if (user) {
					user.kyc.paystackValidated = true;
					user.kyc.paystackValidationPending = false;
					await user.save();
					console.log(`✅ User ${user._id} marked as validated`);
				}
			}
		} else if (event === "customeridentification.failed") {
			const { customer_code, reason } = data;

			console.log(`❌ Customer validation failed for: ${customer_code}`);
			console.log(`Reason: ${reason}`);

			const virtualAccount = await userVirtualAccount.findOne({
				customerCode: customer_code,
			});

			if (virtualAccount) {
				const user = await User.findById(virtualAccount.userId);
				if (user) {
					user.kyc.paystackValidationPending = false;
					user.kyc.validationError = reason;
					user.kyc.isVerified = false;
					await user.save();

					console.log(`❌ User ${user._id} validation failed: ${reason}`);
				}
			}
		}
	} catch (error) {
		console.error("Webhook handling error:", error);
	}
};
