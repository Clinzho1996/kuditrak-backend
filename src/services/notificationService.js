import Wallet from "../models/Wallet.js";
import { sendEmail } from "./emailService.js";
import { sendPush } from "./pushService.js";

export const sendWeeklyBudgetAlerts = async () => {
	const wallets = await Wallet.find().populate("userId");

	for (const wallet of wallets) {
		const user = wallet.userId;
		if (!user) continue;

		const message = `Hello ${user.fullName}, your available balance is ₦${wallet.available}. Check your budgets!`;
		if (user.pushToken)
			await sendPush(user.pushToken, "Weekly Budget Alert", message);
		await sendEmail({
			to: user.email,
			subject: "Weekly Budget Reminder",
			html: `<p>${message}</p>`,
		});
	}
};
