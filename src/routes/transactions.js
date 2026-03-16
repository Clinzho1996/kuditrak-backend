import express from "express";
import {
	createTransaction,
	deleteTransaction,
	getBudgetTransactions,
	getLinkedTransactions,
	getTransactionById,
	getTransactionHistory,
	getUnbudgetedTransactions,
	linkTransactionToBudget,
	listTransactions,
	updateTransaction,
} from "../controllers/transactionController.js";
import protect from "../middleware/auth.js";

const router = express.Router();
router.use(protect);

router.get("/", listTransactions);
router.post("/create", createTransaction);

router.get("/history", getTransactionHistory);

router.get("/linked", getLinkedTransactions);
router.get("/linked/unbudgeted", getUnbudgetedTransactions);
router.get("/linked/budgeted", getBudgetTransactions);

router.get("/:id", getTransactionById);

router.put("/:id", updateTransaction);
router.delete("/:id", deleteTransaction);

router.post("/link-budget", linkTransactionToBudget);

export default router;
