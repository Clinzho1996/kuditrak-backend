// backend/services/paymentGateway.js
import axios from "axios";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const BACKEND_URL =
	process.env.BACKEND_URL || "https://kuditrak-backend.onrender.com";

export const createTopUp = async ({ email, amount, reference, userId }) => {
	try {
		console.log("Creating Paystack transaction for:", {
			email,
			amount,
			reference,
			userId: userId?.toString(),
		});

		const response = await axios.post(
			"https://api.paystack.co/transaction/initialize",
			{
				email,
				amount: amount * 100,
				reference,
				callback_url: `${BACKEND_URL}/api/wallet/verify`,
				metadata: {
					userId: userId.toString(),
					amount: amount,
					type: "topup",
				},
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		console.log("Paystack response:", response.data);

		return {
			paymentLink: response.data.data.authorization_url,
			reference: response.data.data.reference,
		};
	} catch (error) {
		console.error(
			"Paystack initialize error:",
			error.response?.data || error.message,
		);
		throw new Error(
			error.response?.data?.message ||
				"Failed to initialize Paystack transaction",
		);
	}
};

// Helper function to get bank code
// backend/controllers/bankController.js - Add bank code mapping
const getBankCode = (bankName) => {
	const bankCodes = {
		GTBank: "058",
		"Guaranty Trust Bank": "058",
		"Access Bank": "044",
		"Access Bank Plc": "044",
		"Wema Bank": "035",
		"Wema Bank Plc": "035",
		UBA: "033",
		"United Bank For Africa": "033",
		"First Bank": "011",
		"First Bank of Nigeria": "011",
		"Zenith Bank": "057",
		"Zenith Bank Plc": "057",
		FCMB: "214",
		"First City Monument Bank": "214",
		"Stanbic IBTC": "039",
		"Stanbic IBTC Bank": "039",
		"Polaris Bank": "076",
		"Polaris Bank Limited": "076",
		"Union Bank of Nigeria": "032",
		"Union Bank": "032",
		"Fidelity Bank": "070",
		"Fidelity Bank Plc": "070",
		"Sterling Bank": "232",
		"Sterling Bank Plc": "232",
		Ecobank: "050",
		"Ecobank Nigeria": "050",
		"Kuda Bank": "50211",
		"Kuda Microfinance Bank": "50211",
		Opay: "999992",
		"OPay Digital Services": "999992",
		Moniepoint: "999991",
		"Moniepoint Microfinance Bank": "999991",
	};

	return bankCodes[bankName] || null;
};

// When creating bank account, add the bank code
// const createBankAccount = async (userId, accountData) => {
// 	const bankCode = getBankCode(accountData.bankName);

// 	const bankAccount = await BankConnection.create({
// 		userId,
// 		provider: "mono",
// 		accountName: accountData.accountName,
// 		accountNumber: accountData.accountNumber,
// 		bankName: accountData.bankName,
// 		bankCode: bankCode,
// 		monoAccountId: accountData.id,
// 		monoCustomerId: accountData.customerId,
// 		balance: accountData.balance || 0,
// 		currency: accountData.currency || "NGN",
// 		status: "Active",
// 	});

// 	return bankAccount;
// };

// Create or get recipient code for a bank account
// backend/services/paymentGateway.js - Updated getOrCreateRecipient function
export const getOrCreateRecipient = async (bankAccount) => {
	try {
		// If recipient code already exists, return it
		if (bankAccount.recipientCode) {
			console.log("Using existing recipient code:", bankAccount.recipientCode);
			return { success: true, recipientCode: bankAccount.recipientCode };
		}

		// Check if we have bank code
		if (!bankAccount.bankCode) {
			console.error("No bank code for account:", {
				bankName: bankAccount.bankName,
				accountNumber: bankAccount.accountNumber,
			});
			return {
				success: false,
				message: `Bank code not found for ${bankAccount.bankName}. Please contact support.`,
			};
		}

		console.log("Creating new recipient for:", {
			bankName: bankAccount.bankName,
			accountNumber: bankAccount.accountNumber,
			accountName: bankAccount.accountName,
			bankCode: bankAccount.bankCode,
		});

		// Create recipient in Paystack
		const response = await axios.post(
			"https://api.paystack.co/transferrecipient",
			{
				type: "nuban",
				name: bankAccount.accountName,
				account_number: bankAccount.accountNumber,
				bank_code: bankAccount.bankCode,
				currency: "NGN",
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (response.data.status) {
			const recipientCode = response.data.data.recipient_code;
			console.log("Recipient created successfully:", recipientCode);

			// Save recipient code to bank account
			bankAccount.recipientCode = recipientCode;
			bankAccount.recipientCreatedAt = new Date();
			await bankAccount.save();

			return { success: true, recipientCode };
		} else {
			console.error("Failed to create recipient:", response.data);
			return {
				success: false,
				message: response.data.message || "Failed to create transfer recipient",
			};
		}
	} catch (error) {
		console.error(
			"Create recipient error:",
			error.response?.data || error.message,
		);
		return {
			success: false,
			message: error.response?.data?.message || "Failed to create recipient",
		};
	}
};

// Create a payout to a user bank account
export const initiatePayout = async ({
	amount,
	userId,
	bankAccountId,
	reference,
}) => {
	try {
		console.log("Initiating payout:", {
			amount,
			userId,
			bankAccountId,
			reference,
		});

		// Get the bank account from database
		const BankConnection = await import("../models/BankConnection.js").then(
			(m) => m.default,
		);
		const bankAccount = await BankConnection.findOne({
			_id: bankAccountId,
			userId: userId,
			status: "Active",
		});

		if (!bankAccount) {
			console.error("Bank account not found:", bankAccountId);
			return {
				success: false,
				message: "Bank account not found. Please link your bank account first.",
			};
		}

		console.log("Found bank account:", {
			bankName: bankAccount.bankName,
			accountNumber: bankAccount.accountNumber,
			accountName: bankAccount.accountName,
			hasRecipientCode: !!bankAccount.recipientCode,
		});

		// Get or create recipient code
		const recipientResult = await getOrCreateRecipient(bankAccount);

		if (!recipientResult.success) {
			return {
				success: false,
				message: recipientResult.message,
			};
		}

		const koboAmount = Number(amount) * 100;

		console.log("Initiating transfer with:", {
			recipientCode: recipientResult.recipientCode,
			amount: koboAmount,
			reference,
		});

		const response = await axios.post(
			"https://api.paystack.co/transfer",
			{
				source: "balance",
				reason: `Wallet withdrawal - ${reference}`,
				amount: koboAmount,
				recipient: recipientResult.recipientCode,
				reference: reference,
				currency: "NGN",
			},
			{
				headers: {
					Authorization: `Bearer ${PAYSTACK_SECRET}`,
					"Content-Type": "application/json",
				},
			},
		);

		console.log("Transfer response:", response.data);

		if (response.data.status) {
			return {
				success: true,
				message: "Transfer initiated successfully",
				transferCode: response.data.data.transfer_code,
				transferReference: response.data.data.reference,
				data: response.data.data,
			};
		} else {
			return {
				success: false,
				message: response.data.message || "Transfer failed",
			};
		}
	} catch (err) {
		console.error("Payout error:", err.response?.data || err.message);

		// Handle specific Paystack errors
		if (err.response?.data?.message) {
			return {
				success: false,
				message: err.response.data.message,
			};
		}

		return {
			success: false,
			message: err.message || "Payout failed",
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
				amount: selectedPlan.amount * 100,
				reference,
				callback_url: `${BACKEND_URL}/api/subscription/verify`,
				metadata: {
					type: "subscription",
					plan,
					userId: userId.toString(),
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
export const verifySubscriptionPayment = async (req, res) => {
	try {
		const { reference } = req.query;

		console.log("Subscription callback received for reference:", reference);

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
			return res.redirect(
				`kuditrak://subscription/failed?reference=${reference}`,
			);
		}

		const metadata = data.metadata || {};
		const plan = metadata.plan;
		const userId = metadata.userId;

		if (!PLANS[plan]) {
			throw new Error("Invalid plan in metadata");
		}

		// Update user subscription
		const User = await import("../models/User.js").then((m) => m.default);
		const user = await User.findById(userId);

		if (user) {
			const startDate = new Date();
			const endDate = new Date();

			if (plan === "basic") {
				endDate.setMonth(endDate.getMonth() + 1);
			} else if (plan === "pro") {
				endDate.setMonth(endDate.getMonth() + 3);
			}

			user.subscription = {
				plan: plan,
				status: "active",
				startDate: startDate,
				endDate: endDate,
			};
			await user.save();
		}

		const appDeepLink = `kuditrak://subscription/success?reference=${reference}&plan=${plan}`;
		console.log("Redirecting to app:", appDeepLink);

		return res.redirect(appDeepLink);
	} catch (error) {
		console.error("Verify Subscription Error:", error.message);
		return res.redirect(
			`kuditrak://subscription/failed?reference=${reference}`,
		);
	}
};
