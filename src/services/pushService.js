import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount;

// PRODUCTION (Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
	try {
		serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
	} catch (err) {
		console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON");
	}
}

// LOCAL DEVELOPMENT
else {
	try {
		const filePath = path.join(__dirname, "../config/serviceAccountKey.json");

		if (fs.existsSync(filePath)) {
			serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} else {
			console.warn("Firebase serviceAccountKey.json not found. Push disabled.");
		}
	} catch (err) {
		console.error("Failed to load Firebase service account key:", err.message);
	}
}

// Initialize Firebase only if credentials exist
let firebaseApp = null;

if (serviceAccount) {
	firebaseApp = admin.apps.length
		? admin.app()
		: admin.initializeApp({
				credential: admin.credential.cert(serviceAccount),
			});
}

/**
 * Send push notification
 */
export const sendPush = async (token, title, body) => {
	try {
		if (!firebaseApp) {
			console.warn("Firebase not initialized. Push skipped.");
			return;
		}

		await admin.messaging().send({
			token,
			notification: { title, body },
		});

		console.log(`Push sent to ${token}`);
	} catch (err) {
		console.error("Push notification error:", err.message);
	}
};

export default firebaseApp;
