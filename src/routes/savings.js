import express from "express";
import {
	createBucket,
	creditBucket,
	deleteBucket,
	listBuckets,
	lockBucket,
	unlockBucket,
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
// routes/savingsBucketRoutes.js (add these routes)
router.post("/:id/lock", lockBucket);
router.post("/:id/unlock", unlockBucket);

export default router;
