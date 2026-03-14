import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read service account JSON
const serviceAccountPath = path.join(
	__dirname,
	"../config/serviceAccountKey.json",
);
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

// Initialize Firebase safely (only once)
const firebaseApp = admin.apps.length
	? admin.app()
	: admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
		});

/**
 * sendPush
 * @param {string} token - device push token
 * @param {string} title - notification title
 * @param {string} body - notification body
 */
export const sendPush = async (token, title, body) => {
	try {
		await admin.messaging(firebaseApp).send({
			token,
			notification: { title, body },
		});
		console.log(`Push sent to ${token}`);
	} catch (err) {
		console.error("Push notification error:", err.message);
	}
};

export default firebaseApp;
