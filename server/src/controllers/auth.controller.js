import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import admin from "../config/firebase.js";
import User from "../models/user.model.js";
import Device from "../models/device.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 7;
const MAX_DEVICES_PER_USER = 3;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
};

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
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Generate refresh token & family
  const refreshToken = randomUUID();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  const tokenFamily = randomUUID();

  if (user) {
    // Enforce max 3 active devices per user (revoke oldest)
    const activeDevices = await Device.find({ userId: user._id, isRevoked: false }).sort({ lastUsedAt: 1 });
    if (activeDevices.length >= MAX_DEVICES_PER_USER) {
      const oldestDevice = activeDevices[0];
      oldestDevice.isRevoked = true;
      oldestDevice.revokedAt = new Date();
      await oldestDevice.save();
    }

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const userAgent = req.headers["user-agent"] || "";

    await Device.create({
      userId: user._id,
      deviceName: userAgent ? userAgent.substring(0, 80) : "Web Session",
      deviceType: "web",
      refreshTokenHash,
      tokenFamily,
      lastUsedAt: new Date(),
      ipAddress: req.ip || req.connection?.remoteAddress || "",
      userAgent,
      expiresAt,
    });
  }

  res.cookie("zync_refresh_token", refreshToken, COOKIE_OPTIONS);

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

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.zync_refresh_token;

  if (!refreshToken) {
    throw new apiError(401, "No refresh token provided");
  }

  // Find non-revoked devices to match refresh token
  const devices = await Device.find({ isRevoked: false });

  let matchedDevice = null;
  for (const device of devices) {
    const isMatch = await bcrypt.compare(refreshToken, device.refreshTokenHash);
    if (isMatch) {
      matchedDevice = device;
      break;
    }
  }

  if (!matchedDevice) {
    res.clearCookie("zync_refresh_token", COOKIE_OPTIONS);
    throw new apiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(matchedDevice.userId);
  if (!user) {
    res.clearCookie("zync_refresh_token", COOKIE_OPTIONS);
    throw new apiError(401, "User not found");
  }

  // Issue new Access JWT
  const newAccessToken = jwt.sign(
    {
      sub: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email || "",
      email_verified: user.emailVerified || false,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Rotate refresh token (same family, new token & hash)
  const newRefreshToken = randomUUID();
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

  matchedDevice.refreshTokenHash = newRefreshTokenHash;
  matchedDevice.lastUsedAt = new Date();
  matchedDevice.expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await matchedDevice.save();

  res.cookie("zync_refresh_token", newRefreshToken, COOKIE_OPTIONS);

  return res.status(200).json(
    new apiResponse(200, "Token refreshed successfully", {
      accessToken: newAccessToken,
    })
  );
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.zync_refresh_token;
  res.clearCookie("zync_refresh_token", COOKIE_OPTIONS);

  if (refreshToken) {
    const devices = await Device.find({ isRevoked: false });
    for (const device of devices) {
      if (await bcrypt.compare(refreshToken, device.refreshTokenHash)) {
        device.isRevoked = true;
        device.revokedAt = new Date();
        await device.save();
        break;
      }
    }
  }

  return res.status(200).json(new apiResponse(200, "Logged out successfully"));
});

export const getDevices = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const devices = await Device.find({ userId, isRevoked: false })
    .select("_id deviceName deviceType lastUsedAt ipAddress userAgent createdAt")
    .sort({ lastUsedAt: -1 });

  return res.status(200).json(new apiResponse(200, "Active devices retrieved", devices));
});

export const revokeDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const userId = req.user._id;

  const device = await Device.findOne({ _id: deviceId, userId, isRevoked: false });
  if (!device) {
    throw new apiError(404, "Device session not found or already revoked");
  }

  device.isRevoked = true;
  device.revokedAt = new Date();
  await device.save();

  return res.status(200).json(new apiResponse(200, "Device session revoked successfully"));
});
