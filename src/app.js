import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import "./cron.js";
import { initSubscriptionSync } from "./cron/syncSubscription.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import adminRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import { default as bankRoutes } from "./routes/banks.js";
import budgetRoutes from "./routes/budget.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import insightRoutes from "./routes/insight.js";
import monoRoutes from "./routes/monoWebhook.js";
import notificationRoutes from "./routes/notifications.js";
import savingsRoutes from "./routes/savings.js";
import subscriptionRoutes from "./routes/subscription.js";
import transactionRoutes from "./routes/transactions.js";
import userRoutes from "./routes/users.js";
import walletRoutes from "./routes/wallet.js";

dotenv.config();
const app = express();
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/insights", insightRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/account", bankRoutes);
app.use("/api/mono", monoRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);

// Error handler
app.use(errorMiddleware);

const allowedOrigins = [
	"http://localhost:3000", // Local development
	"https://kuditrak-admin.vercel.app", // Production frontend
	"https://kuditrak.com",
	"https://admin.kuditrak.com", // Your main domain
	"http://localhost:5000", // Backend itself
];

app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (like mobile apps, curl, etc.)
			if (!origin) return callback(null, true);

			if (
				allowedOrigins.indexOf(origin) !== -1 ||
				process.env.NODE_ENV !== "production"
			) {
				callback(null, true);
			} else {
				callback(new Error("Not allowed by CORS"));
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	}),
);

// DB Connection
mongoose
	.connect(process.env.MONGO_URI)
	.then(() => console.log("MongoDB connected"))
	.catch((err) => console.error(err));

await initSubscriptionSync();

export default app;
