import admin from "firebase-admin";
import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";


if (!admin.apps.length) {
    admin.initializeApp({
    })
}

const authenticateUser = async (req, res, next) => {
    try {
        // Verify Header Presence & Structure...
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json(new apiResponse(401, "Authentication token missing or malformed. Format must be 'Bearer <token>'.", {}));
        }
        // Token...
        const token = authHeader.split(" ")[1];
        // Devlopment Bypass
        if(token === "DEV_TEST_TOKEN"){
            req.authContext = {
                uid: "firebase_mock_uid_123",
                email: "test@zync.dev",
                emailVerified: true
            };
            req.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
            return next();
        }

        // Verify Token...
        const decodedToken = await admin.auth().verifyIdToken(token);
        if (!decodedToken) {
            return res.status(401).json(new apiResponse(401, "Invalid token payload.", {}));
        }
        // Database lookup & Hydration Strategy...
        let user =await User.findOne({ firebaseUid: decodedToken.uid, deleteAt: null });
        
        req.authContext = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
        };

        req.user = user || null;
        next();

    } catch (error) {
        console.error("🔒 Auth Middleware Exception:", error.message);

        if(error.code === "auth/id-token-expired"){
            return res.status(401).json(new apiResponse(401, "Authentication token expired.", {}));
        }
        if(error.code === "auth/id-token-revoked"){
            return res.status(401).json(new apiResponse(401, "Authentication token revoked.", {}));
        }
        if(error.code === "auth/user-not-found"){
            return res.status(401).json(new apiResponse(401, "User not found.", {}));
        }
        if(error.code === "auth/invalid-auth-uid"){
            return res.status(401).json(new apiResponse(401, "Invalid authentication UID.", {}));
        }

        return res.status(401).json(new apiResponse(401,"Access denied. Token verification failed.",{}))
    }
}

export default authenticateUser;