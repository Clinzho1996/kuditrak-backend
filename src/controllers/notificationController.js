import { sendPush } from "../services/pushService.js";

export const pushNotification = async (req, res) => {
	const { token, title, body, data } = req.body;
	try {
		await sendPush(token, title, body, data);
		res.status(200).json({ message: "Notification sent" });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
