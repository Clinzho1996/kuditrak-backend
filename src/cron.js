import cron from "node-cron";
import BankConnection from "./models/BankConnection.js";

import User from "./models/User.js";
import { calculateUserInsights } from "./services/analyticsService.js";
import { pullTransactionsFromMono } from "./services/monoService.js";
import { sendPush } from "./services/pushService.js";

// Daily budget alert at 8am
cron.schedule("0 8 * * *", async () => {
	const users = await User.find({ pushToken: { $exists: true } });
	for (const user of users) {
		try {
			// this will calculate insights AND send alerts internally
			await calculateUserInsights(user, true); // true = sendAlerts
		} catch (err) {
			console.error(`Budget alert failed for ${user.email}: ${err.message}`);
		}
	}
	console.log("Daily budget alerts sent");
});

// Weekly summary at Monday 9am
cron.schedule("0 9 * * MON", async () => {
	const users = await User.find({ pushToken: { $exists: true } });
	for (const user of users) {
		try {
			const insights = await calculateUserInsights(user, false); // don't send alerts
			const { balance, totalSpent, totalSaved } = insights.data;
			await sendPush(
				user.pushToken,
				`📊 Weekly Summary: Balance ${balance}, Spent ${totalSpent}, Saved ${totalSaved}`,
			);
		} catch (err) {
			console.error(`Weekly summary failed for ${user.email}: ${err.message}`);
		}
	}
	console.log("Weekly summaries sent");
});

// Daily transaction pull at 2am
cron.schedule("0 2 * * *", async () => {
	// daily at 2AM
	const connections = await BankConnection.find({ status: "Active" });

	for (const conn of connections) {
		const since = conn.lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000);

		try {
			await pullTransactionsFromMono(conn, since);
			conn.lastSync = new Date();
			await conn.save();
		} catch (err) {
			console.error(
				`Failed to pull transactions for ${conn.accountNumber}:`,
				err,
			);
		}
	}

	console.log("Daily Mono transaction pull complete");
});
