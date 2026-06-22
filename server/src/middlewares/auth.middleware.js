import admin from "../config/firebase.js";
import User from "../models/user.model.js";

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // Dev bypass for testing
    if (token === "DEV_TEST_TOKEN") {
      req.authContext = { uid: "firebase_mock_uid_123", email: "test@zync.dev" };
      req.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
      return next();
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.authContext = decoded;

      // Block unverified email addresses
      if (decoded.email && decoded.email_verified === false) {
        return res.status(403).json({
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          error: "Please verify your email address before continuing.",
        });
      }

      req.user = await User.findOne({ firebaseUid: decoded.uid });

      // Keep email verification status in sync
      if (req.user && req.user.emailVerified !== decoded.email_verified) {
        req.user.emailVerified = !!decoded.email_verified;
        await req.user.save();
      }

      // Allow /setup and /me through even without a profile
      const isSetupRoute = req.originalUrl.includes("/setup");
      const isMeRoute = req.originalUrl.includes("/me");

      if (!req.user && !isSetupRoute && !isMeRoute) {
        return res.status(403).json({ success: false, error: "Profile not found. Please complete setup." });
      }

      next();
    } catch (firebaseErr) {
      console.error("Firebase token error:", firebaseErr.message);
      return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

export default authenticateUser;