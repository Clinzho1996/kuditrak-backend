import express from "express";
import {
	allocateSavings,
	getBalance,
	getVirtualAccount,
	handleDvaWebhook,
	topUpWallet,
	transferFunds,
	verifyWalletTopUp,
	withdrawToBank,
} from "../controllers/walletController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

router.post("/topup", protect, topUpWallet);
router.get("/verify", verifyWalletTopUp);
router.post("/transfer", protect, transferFunds);
router.post("/allocate", protect, allocateSavings);
router.get("/balance", protect, getBalance);
router.post("/withdraw", protect, withdrawToBank);

// DVA endpoints
router.get("/virtual-account", protect, getVirtualAccount);
router.post("/webhook/dva", handleDvaWebhook); // No auth - Paystack webhook

// Card payment endpoints
router.post("/topup", protect, topUpWallet);
router.get("/verify", verifyWalletTopUp);

export default router;
