export const createTopUp = async ({ userId, amount }) => {
	const reference = `TRX-${Date.now()}-${userId}`;
	return { paymentLink: "https://gatewaylink.com", reference };
};

export const verifyTopUp = async ({ reference }) => {
	return { status: "success", amount: 10000, currency: "NGN" };
};
