import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateUser = async (req, res, next) => {
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

    // Verify Zync JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, error: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    // Fetch user from DB using sub (user ID)
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    req.user = user;
    req.authContext = { uid: decoded.firebaseUid, sub: decoded.sub };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

export default authenticateUser;