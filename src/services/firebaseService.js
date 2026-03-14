import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase service account
const serviceAccountPath = path.join(
	__dirname,
	"../config/serviceAccountKey.json",
);

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

// Initialize Firebase only once
const firebaseApp = admin.apps.length
	? admin.app()
	: admin.initializeApp({
			credential: admin.credential.cert(serviceAccount),
		});

// Verify Firebase ID Token
export const verifyFirebaseToken = async (idToken) => {
	try {
		const decoded = await firebaseApp.auth().verifyIdToken(idToken);
		return decoded;
	} catch (error) {
		throw new Error("Invalid Firebase token");
	}
};
