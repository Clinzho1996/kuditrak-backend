import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount;

// PRODUCTION (Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
	try {
		const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
		serviceAccount = JSON.parse(rawJson);

		// CRITICAL: Ensure the private key handles newlines correctly
		if (serviceAccount.private_key) {
			serviceAccount.private_key = serviceAccount.private_key.replace(
				/\\n/g,
				"\n",
			);
		}
		console.log("✅ Firebase service account loaded from environment");
	} catch (err) {
		console.error("🔥 Error parsing FIREBASE_SERVICE_ACCOUNT:", err.message);
	}
}

// LOCAL DEVELOPMENT
else {
	try {
		const serviceAccountPath = path.join(
			__dirname,
			"../config/serviceAccountKey.json",
		);

		if (fs.existsSync(serviceAccountPath)) {
			serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
			console.log("✅ Firebase service account loaded from file");
		} else {
			console.warn(
				"⚠️ serviceAccountKey.json not found. Firebase auth disabled.",
			);
		}
	} catch (err) {
		console.error("❌ Failed to load Firebase service account:", err.message);
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
	console.log("✅ Firebase initialized");
}

// ============================================================
// FIXED: Verify Firebase ID Token with proper logging
// ============================================================
export const verifyFirebaseToken = async (idToken) => {
	try {
		if (!firebaseApp) {
			throw new Error("Firebase not initialized");
		}

		console.log(`🔍 Verifying Firebase token...`);

		const decoded = await admin.auth().verifyIdToken(idToken);

		// Log ALL claims from the decoded token
		console.log(`🔓 Token decoded successfully`);
		console.log(`   UID: ${decoded.uid}`);
		console.log(`   Email: ${decoded.email}`);
		console.log(
			`   Provider: ${decoded.firebase?.sign_in_provider || "unknown"}`,
		);
		console.log(`   All claims:`, Object.keys(decoded));

		// CRITICAL: Check for transfer_sub claim (Apple app transfer)
		if (decoded.transfer_sub) {
			console.log(`   ✅ transfer_sub found: ${decoded.transfer_sub}`);
		} else {
			console.log(`   ℹ️ No transfer_sub claim in token`);
		}

		// Log the full decoded token for debugging (but hide sensitive data)
		console.log(`   Full decoded (sensitive hidden):`, {
			uid: decoded.uid,
			email: decoded.email,
			firebase: decoded.firebase,
			transfer_sub: decoded.transfer_sub,
			email_verified: decoded.email_verified,
			phone_number: decoded.phone_number,
			iss: decoded.iss,
			aud: decoded.aud,
			iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null,
			exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
		});

		return decoded;
	} catch (error) {
		console.error("❌ Firebase token verification failed:", error.message);
		throw new Error("Invalid Firebase token");
	}
};

export default firebaseApp;
