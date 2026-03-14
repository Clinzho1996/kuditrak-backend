import axios from "axios";
import Transaction from "../models/Transaction.js";

const mono = axios.create({
	baseURL: process.env.MONO_BASE_URL,
	headers: {
		"mono-sec-key": process.env.MONO_SECRET_KEY,
		"Content-Type": "application/json",
	},
});

export default mono;

export const pullTransactionsFromMono = async (conn, since) => {
	const url = `https://api.withmono.com/accounts/${conn.monoAccountId}/transactions?start=${since.toISOString()}`;

	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${process.env.MONO_SECRET_KEY}`,
			"Content-Type": "application/json",
		},
	});

	const result = await res.json();

	for (const tx of result.data) {
		await Transaction.updateOne(
			{ transactionId: tx._id },
			{
				userId: conn.userId,
				bankConnectionId: conn._id,
				transactionId: tx._id,
				amount: tx.amount,
				type: tx.amount > 0 ? "income" : "expense",
				description: tx.narration,
				categoryId: null,
				categoryName: null,
				source: "bank",
				date: tx.date,
			},
			{ upsert: true },
		);
	}
};
