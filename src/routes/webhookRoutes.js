// routes/webhookRoutes.js
import axios from "axios";
import express from "express";
import User from "../models/User.js";
import userVirtualAccount from "../models/userVirtualAccount.js";
import { sendPushToUser } from "../services/pushService.js";

const router = express.Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Create virtual account after validation
const createVirtualAccountAfterValidation = async (customerCode, user) => {
	try {
		console.log(
			`Creating virtual account for validated customer: ${customerCode}`,
		);

		// Get available banks
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

		// Create dedicated virtual account
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

			console.log(`✅ Virtual account created: ${data.account_number}`);
			return virtualAccount;
		}
		return null;
	} catch (error) {
		console.error(
			"Create virtual account error:",
			error.response?.data || error.message,
		);
		return null;
	}
};

// Webhook handler
router.post("/paystack", async (req, res) => {
	try {
		const event = req.body;
		console.log("📨 Paystack webhook received:", event.event);
		console.log("Webhook data:", JSON.stringify(event.data, null, 2));

		// Handle customer identification success
		if (event.event === "customeridentification.success") {
			const { customer_code, identification } = event.data;

			console.log(`✅ Customer validation successful for: ${customer_code}`);

			// Find user by customer_code
			const user = await User.findOne({
				"kyc.paystackCustomerCode": customer_code,
			});

			if (user) {
				console.log(`✅ User found: ${user._id} (${user.email})`);

				// Update user's KYC status
				user.kyc.paystackValidated = true;
				user.kyc.paystackValidationPending = false;
				user.kyc.isVerified = true;
				user.kyc.verifiedAt = new Date();
				user.kyc.bvnVerified = true;

				// Update name from BVN if needed
				if (identification?.first_name && identification?.last_name) {
					const fullName = `${identification.first_name} ${identification.last_name}`;
					if (fullName !== user.fullName) {
						console.log(
							`📝 Updating user name from BVN: "${user.fullName}" -> "${fullName}"`,
						);
						user.fullName = fullName;
					}
				}

				await user.save();
				console.log(`✅ User KYC updated to verified`);

				// Create virtual account
				console.log("🔵 Creating virtual account for user...");
				const virtualAccount = await createVirtualAccountAfterValidation(
					customer_code,
					user,
				);

				if (virtualAccount) {
					console.log(
						`✅ Virtual account created: ${virtualAccount.accountNumber} (${virtualAccount.bankName})`,
					);
				} else {
					console.log("⚠️ Virtual account creation pending or failed");
				}

				// Send push notification to user
				try {
					await sendPushToUser(
						user._id,
						"✅ KYC Verified!",
						"Your KYC has been verified. You can now fund your wallet via bank transfer!",
						{ type: "kyc_complete", screen: "topup" },
					);
					console.log("✅ Push notification sent to user");
				} catch (notifError) {
					console.error("Failed to send notification:", notifError);
				}
			} else {
				console.log(`❌ No user found with customer code: ${customer_code}`);
			}
		}
		// Handle customer identification failure
		else if (event.event === "customeridentification.failed") {
			const { customer_code, reason } = event.data;

			console.log(`❌ Customer validation failed for: ${customer_code}`);
			console.log(`Reason: ${reason}`);

			const user = await User.findOne({
				"kyc.paystackCustomerCode": customer_code,
			});

			if (user) {
				user.kyc.paystackValidationPending = false;
				user.kyc.validationError = reason;
				await user.save();
				console.log(`❌ User ${user._id} validation marked as failed`);
			}
		}

		// Always return 200 to acknowledge receipt
		res.sendStatus(200);
	} catch (error) {
		console.error("Webhook error:", error);
		res.sendStatus(500);
	}
});

export default router;
