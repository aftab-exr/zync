import admin from "../config/firebase.js";
import User from "../models/user.model.js";

const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "No token provided" });
        }

        const token = authHeader.split(" ")[1];

        // 🚧 DEVELOPMENT BYPASS (For Postman)
        if (token === "DEV_TEST_TOKEN") {
            req.authContext = { uid: "firebase_mock_uid_123", email: "test@zync.dev" };
            req.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
            return next();
        }

        // 🚀 REAL FIREBASE VERIFICATION (For React Frontend)
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.authContext = decodedToken; // Attach Firebase Identity

            // Check if the user already has a Zync profile in MongoDB
            req.user = await User.findOne({ firebaseUid: decodedToken.uid });

            // 🛑 THE CATCH-22 FIX:
            // If they have no Zync profile, block them UNLESS they are trying to create one via /setup
            if (!req.user && !req.originalUrl.includes('/setup')) {
                return res.status(401).json({ success: false, error: "Zync profile not found. Please complete setup." });
            }

            next();
        } catch (firebaseErr) {
            console.error("🔴 Firebase Token Error:", firebaseErr.message);
            return res.status(401).json({ success: false, error: "Invalid or expired token" });
        }

    } catch (error) {
        console.error("🔴 Auth Middleware Error:", error.message);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

export default authenticateUser;