import express from "express";
import {
	allocateSavings,
	getBalance,
	topUpWallet,
	transferFunds,
	verifyWalletTopUp,
	withdrawToBank,
} from "../controllers/walletController.js";
import protect from "../middleware/auth.js";

const router = express.Router();
router.use(protect);

router.post("/topup", topUpWallet);
router.get("/verify", verifyWalletTopUp);
router.post("/transfer", transferFunds);
router.post("/allocate", allocateSavings);
router.get("/balance", getBalance);
router.post("/withdraw", withdrawToBank);

export default router;
