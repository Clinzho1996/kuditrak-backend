import express from "express";
import { pushNotification } from "../controllers/notificationController.js";
import protect from "../middleware/auth.js";

const router = express.Router();
router.use(protect);

router.post("/push", pushNotification);

export default router;
