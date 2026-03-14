import axios from "axios";
import dotenv from "dotenv";
import Transaction from "../models/Transaction.js";

dotenv.config();

const mono = axios.create({
	baseURL: process.env.MONO_BASE_URL,
	headers: {
		"mono-sec-key": process.env.MONO_SECRET_KEY,
		"Content-Type": "application/json",
	},
});

console.log(
	"Mono service initialized with base URL:",
	process.env.MONO_BASE_URL,
);
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
