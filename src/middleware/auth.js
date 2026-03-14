// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
	console.log("Protect middleware called");
	console.log("Arguments:", { hasReq: !!req, hasRes: !!res, hasNext: !!next });
	console.log("Next type:", typeof next);

	try {
		let token;
		if (
			req.headers.authorization &&
			req.headers.authorization.startsWith("Bearer")
		) {
			token = req.headers.authorization.split(" ")[1];
		}

		if (!token) {
			console.log("No token found");
			return res.status(401).json({ message: "Not authorized, token missing" });
		}

		console.log("Token found, verifying...");
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		console.log("Token decoded:", decoded);

		const user = await User.findById(decoded.id).select("-password");
		console.log("User found:", !!user);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		req.user = user;
		console.log("Calling next()");
		next(); // This should work now
	} catch (error) {
		console.log("Error in protect middleware:", error.message);
		res.status(401).json({ message: "Not authorized, token failed" });
	}
};

export default protect;
