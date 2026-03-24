import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import "./cron.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/auth.js";
import { default as bankRoutes } from "./routes/banks.js";
import budgetRoutes from "./routes/budget.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import insightRoutes from "./routes/insight.js";
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
app.use("/api/subscription", subscriptionRoutes);

// Error handler
app.use(errorMiddleware);

// DB Connection
mongoose
	.connect(process.env.MONGO_URI)
	.then(() => console.log("MongoDB connected"))
	.catch((err) => console.error(err));

export default app;
