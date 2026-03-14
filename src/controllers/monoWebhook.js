// controllers/monoWebhook.js
import Transaction from "../models/Transaction.js";
import BankConnection from "../models/BankConnection.js";

export const monoWebhook = async (req, res) => {
  const { type, data } = req.body;

  if (type === "transactions.updated") {
    const { customerId, accountId, transactions } = data;

    const bankConn = await BankConnection.findOne({ monoCustomerId: customerId });
    if (!bankConn) return res.status(404).send("Connection not found");

    for (const tx of transactions) {
      // Upsert transaction to avoid duplicates
      await Transaction.updateOne(
        { transactionId: tx._id },
        {
          userId: bankConn.userId,
          bankConnectionId: bankConn._id,
          transactionId: tx._id,
          amount: tx.amount,
          type: tx.amount > 0 ? "income" : "expense",
          description: tx.narration,
          categoryId: null,
          categoryName: null,
          source: "bank",
          date: tx.date,
        },
        { upsert: true }
      );
    }
  }

  res.status(200).send("Webhook processed");
};