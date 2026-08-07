import jwt from "jsonwebtoken";
import admin from "../config/firebase.js";
import User from "../models/user.model.js";

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Fallback: Check if it's a direct Firebase ID Token (e.g. during initial profile setup)
      try {
        const firebaseDecoded = await admin.auth().verifyIdToken(token);
        const user = await User.findOne({ firebaseUid: firebaseDecoded.uid });
        req.user = user || null;
        req.authContext = {
          uid: firebaseDecoded.uid,
          sub: user?._id?.toString() || null,
          email: firebaseDecoded.email || "",
          emailVerified: firebaseDecoded.email_verified || false,
        };
        return next();
      } catch (_firebaseErr) {
        if (err.name === "TokenExpiredError") {
          return res.status(401).json({ success: false, error: "Token expired", code: "TOKEN_EXPIRED" });
        }
        return res.status(401).json({ success: false, error: "Invalid token" });
      }
    }

    if (decoded.sub) {
      const user = await User.findById(decoded.sub);
      req.user = user || null;
    }

    req.authContext = {
      uid: decoded.firebaseUid,
      sub: decoded.sub,
      email: decoded.email,
      emailVerified: decoded.email_verified,
    };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

export default authenticateUser;