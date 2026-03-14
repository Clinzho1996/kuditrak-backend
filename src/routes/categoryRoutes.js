import express from "express";
import {
	createCategory,
	deleteCategory,
	listCategories,
	updateCategory,
} from "../controllers/categoryController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

router.get("/", protect, listCategories);
router.post("/", protect, createCategory);
router.put("/:id", protect, updateCategory);
router.delete("/:id", protect, deleteCategory);

export default router;
