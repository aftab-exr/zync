import admin from "../config/firebase.js";
import User from "../models/user.model.js";

const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "No token provided" });
        }

        const token = authHeader.split(" ")[1];

        // 🚧 DEVELOPMENT BYPASS
        if (token === "DEV_TEST_TOKEN") {
            req.authContext = { uid: "firebase_mock_uid_123", email: "test@zync.dev" };
            req.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
            return next();
        }

        // 🚀 REAL FIREBASE VERIFICATION
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.authContext = decodedToken;

            req.user = await User.findOne({ firebaseUid: decodedToken.uid });

            // ⚡ THE FIX: Allow /setup AND /me to pass through so the controller can handle new users
            const isSetupRoute = req.originalUrl.includes('/setup');
            const isMeRoute = req.originalUrl.includes('/me');

            if (!req.user && !isSetupRoute && !isMeRoute) {
                // Use 403 to distinguish from a dead token (401)
                return res.status(403).json({ success: false, error: "Zync profile not found. Please complete setup." });
            }

            next();
        } catch (firebaseErr) {
            console.error("🔴 Firebase Token Error:", firebaseErr.stack || firebaseErr);
            return res.status(401).json({ success: false, error: "Invalid or expired token" });
        }

    } catch (error) {
        console.error("🔴 Auth Middleware Error:", error.stack || error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

export default authenticateUser;