import jwt from "jsonwebtoken";
import admin from "../config/firebase.js";
import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "7d";

export const login = asyncHandler(async (req, res) => {
  const { firebaseIdToken } = req.body;

  if (!firebaseIdToken) {
    throw new apiError(400, "firebaseIdToken is required");
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(firebaseIdToken);
  } catch (err) {
    console.error("Firebase ID Token Verification Error:", err.message);
    throw new apiError(401, "Invalid or expired Firebase token");
  }

  const user = await User.findOne({ firebaseUid: decoded.uid });

  const accessToken = jwt.sign(
    {
      sub: user?._id?.toString() || null,
      firebaseUid: decoded.uid,
      email: decoded.email || "",
      email_verified: decoded.email_verified || false,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return res.status(200).json(
    new apiResponse(200, "Login successful", {
      accessToken,
      user: user
        ? {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            email: user.email,
          }
        : null,
    })
  );
});

export const logout = asyncHandler(async (req, res) => {
  return res.status(200).json(new apiResponse(200, "Logged out successfully"));
});
