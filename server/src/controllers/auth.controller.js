import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import admin from "../config/firebase.js";
import User from "../models/user.model.js";
import Device from "../models/device.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const JWT_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 7;
const MAX_DEVICES_PER_USER = 3;

// ---------------------
// POST /api/v1/auth/login
// ---------------------
export const login = asyncHandler(async (req, res) => {
  const { firebaseIdToken } = req.body;

  if (!firebaseIdToken) {
    throw new apiError(400, "firebaseIdToken is required");
  }

  // Dev bypass
  if (firebaseIdToken === "DEV_TEST_TOKEN") {
    return devLogin(req, res);
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(firebaseIdToken);
  } catch {
    throw new apiError(401, "Invalid or expired Firebase token");
  }

  if (decoded.email && decoded.email_verified === false) {
    throw new apiError(403, "Email not verified");
  }

  let user = await User.findOne({ firebaseUid: decoded.uid });

  // Generate Zync access JWT
  const accessToken = jwt.sign(
    { sub: user?._id.toString() || null, firebaseUid: decoded.uid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  // Generate refresh token
  const refreshToken = randomUUID();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  const tokenFamily = randomUUID();

  if (user) {
    // Enforce max 3 devices
    const deviceCount = await Device.countDocuments({ userId: user._id, isRevoked: false });
    if (deviceCount >= MAX_DEVICES_PER_USER) {
      // Revoke oldest
      const oldestDevice = await Device.findOne({ userId: user._id, isRevoked: false }).sort({ lastUsedAt: 1 });
      if (oldestDevice) {
        oldestDevice.isRevoked = true;
        oldestDevice.revokedAt = new Date();
        await oldestDevice.save();
      }
    }

    await Device.create({
      userId: user._id,
      deviceName: req.headers["user-agent"] || "Unknown Device",
      deviceType: "web",
      refreshTokenHash,
      tokenFamily,
      lastUsedAt: new Date(),
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"] || "",
    });
  }

  // Set refresh token cookie
  res.cookie("zync_refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json(
    new apiResponse(200, "Login successful", {
      accessToken,
      user: user
        ? {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            publicKey: user.publicKey,
            settings: user.settings,
          }
        : null,
    })
  );
});

// ---------------------
// POST /api/v1/auth/refresh
// ---------------------
export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.zync_refresh_token;

  if (!refreshToken) {
    throw new apiError(401, "No refresh token provided");
  }

  // Find all active devices for this token (try matching against all)
  const devices = await Device.find({ isRevoked: false }).lean();

  let matchedDevice = null;
  for (const d of devices) {
    if (await bcrypt.compare(refreshToken, d.refreshTokenHash)) {
      matchedDevice = d;
      break;
    }
  }

  if (!matchedDevice) {
    res.clearCookie("zync_refresh_token");
    throw new apiError(401, "Invalid refresh token");
  }

  // Issue new access JWT
  const user = await User.findById(matchedDevice.userId).lean();
  const accessToken = jwt.sign(
    { sub: matchedDevice.userId.toString(), firebaseUid: user?.firebaseUid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  // Rotate refresh token
  const newRefreshToken = randomUUID();
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

  matchedDevice.refreshTokenHash = newRefreshTokenHash;
  matchedDevice.lastUsedAt = new Date();
  await matchedDevice.save();

  res.cookie("zync_refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json(
    new apiResponse(200, "Token refreshed", { accessToken })
  );
});

// ---------------------
// POST /api/v1/auth/logout
// ---------------------
export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.zync_refresh_token;

  // Clear cookie regardless
  res.clearCookie("zync_refresh_token");

  if (!refreshToken) {
    return res.status(200).json(new apiResponse(200, "Logged out"));
  }

  // Find and revoke matching device
  const devices = await Device.find({ isRevoked: false });
  for (const d of devices) {
    if (await bcrypt.compare(refreshToken, d.refreshTokenHash)) {
      d.isRevoked = true;
      d.revokedAt = new Date();
      await d.save();
      break;
    }
  }

  return res.status(200).json(new apiResponse(200, "Logged out"));
});

// --------------------- helpers ---------------------

const _generateToken = (_user) =>
  jwt.sign({ sub: _user._id.toString(), firebaseUid: _user.firebaseUid }, JWT_SECRET, { expiresIn: JWT_EXPIRY });