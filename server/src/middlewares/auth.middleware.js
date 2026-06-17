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

            // 🛡️ ZERO-COST EMAIL GATE: Firebase already verifies email ownership for
            // free (Google sign-in is always verified; email/password sign-ups carry
            // `email_verified: false` until the user clicks the Firebase link). We gate
            // every protected route on that claim rather than running a parallel OTP
            // system. No email is sent from our infra, so this scales at zero cost.
            if (decodedToken.email && decodedToken.email_verified === false) {
                return res.status(403).json({
                    success: false,
                    code: "EMAIL_NOT_VERIFIED",
                    error: "Please verify your email address before continuing."
                });
            }

            req.user = await User.findOne({ firebaseUid: decodedToken.uid });

            // Keep the persisted verification flag in sync with Firebase's source of
            // truth (cheap, only writes when the value actually drifted).
            if (req.user && req.user.emailVerified !== decodedToken.email_verified) {
                req.user.emailVerified = !!decodedToken.email_verified;
                await req.user.save();
            }

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