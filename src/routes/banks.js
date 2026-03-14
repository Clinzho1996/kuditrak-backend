import express from "express";

import {
	getUserBankAccounts,
	linkBankAccount,
	saveMonoCustomerId,
	unlinkBankAccount,
} from "../controllers/bankController.js";
import { pullMonoTransactions } from "../controllers/transactionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

router.post("/mono-customer", protect, saveMonoCustomerId);
router.post("/link", protect, linkBankAccount);

router.get("/", protect, getUserBankAccounts);

router.delete("/:accountId", protect, unlinkBankAccount);
router.get("/:accountId/transactions", protect, pullMonoTransactions);

export default router;
