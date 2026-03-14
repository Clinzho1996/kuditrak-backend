import express from "express";
import {
	allocateSavings,
	getBalance,
	topUpWallet,
	transferFunds,
} from "../controllers/walletController.js";
import protect from "../middleware/auth.js";

const router = express.Router();
router.use(protect);

router.post("/topup", topUpWallet);
router.post("/transfer", transferFunds);
router.post("/allocate", allocateSavings);
router.get("/balance", getBalance);

export default router;
