import express from "express";
import {
	createBucket,
	creditBucket,
	deleteBucket,
	listBuckets,
	updateBucket,
	withdrawFromBucket,
} from "../controllers/savingsController.js";
import protect from "../middleware/auth.js";

const router = express.Router();
router.use(protect);

router.post("/", createBucket);
router.get("/", listBuckets);
router.put("/:id", updateBucket);
router.delete("/:id", deleteBucket);
router.post("/:id/credit", creditBucket);
router.post("/:id/withdraw", withdrawFromBucket);

export default router;
