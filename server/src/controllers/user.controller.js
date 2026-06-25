import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary from "../config/cloudinary.js";
import { DISPLAY_NAME_LOCKOUT_DAYS, USERNAME_LOCKOUT_DAYS } from "../constants/constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntilUnlock(lastChangedAt, lockoutDays) {
  if (!lastChangedAt) return 0;
  const remaining = lockoutDays * DAY_MS - (Date.now() - lastChangedAt.getTime());
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS);
}

const pluralize = (n) => `${n} ${n === 1 ? "day" : "days"}`;

export const setupProfile = asyncHandler(async (req, res) => {
  const { username, displayName, avatarUrl } = req.body;
  const { uid, email, emailVerified } = req.authContext;

  if (!username || username.length < 3 || username.length > 30) {
    throw new apiError(400, "Username must be 3–30 characters.");
  }
  if (!/^[a-z0-9_]+$/i.test(username)) {
    throw new apiError(400, "Username can only contain letters, numbers, and underscores.");
  }

  const [existingUser, existingUsername] = await Promise.all([
    User.findOne({ firebaseUid: uid }),
    User.findOne({ username: username.toLowerCase() }),
  ]);

  if (existingUser) throw new apiError(400, "Profile already exists.");
  if (existingUsername) throw new apiError(409, "Username already taken.");

  const newUser = await User.create({
    firebaseUid: uid,
    email,
    emailVerified,
    username: username.toLowerCase(),
    displayName,
    avatarUrl: avatarUrl || "",
  });

  return res.status(201).json(new apiResponse(201, "Profile created.", newUser));
});

export const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(200).json(new apiResponse(200, "Search results", []));
  }

  const users = await User.find({
    username: new RegExp(`^${q}`, "i"),
    _id: { $ne: req.user._id },
    deletedAt: null,
  })
    .select("username displayName avatarUrl status.lastSeen identityKeyPublic publicKey")
    .limit(10)
    .lean();

  res.status(200).json(new apiResponse(200, "Search results", users));
});

export const getMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(200).json({ status: "REGISTRATION_REQUIRED" });
  }
  res.status(200).json(new apiResponse(200, "Profile fetched.", req.user));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, username, avatarUrl } = req.body;
  const user = req.user;

  if (!user) throw new apiError(404, "Profile not found.");

  const updates = {};

  // Display name — 14-day lockout
  if (typeof displayName === "string" && displayName.trim() !== user.displayName) {
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      throw new apiError(400, "Display name must be 1–50 characters.");
    }
    const wait = daysUntilUnlock(user.lastDisplayNameChangeAt, DISPLAY_NAME_LOCKOUT_DAYS);
    if (wait > 0) throw new apiError(429, `Wait ${pluralize(wait)} before changing your display name.`);
    updates.displayName = trimmed;
    updates.lastDisplayNameChangeAt = new Date();
  }

  // Username — 60-day lockout
  if (typeof username === "string" && username.toLowerCase().trim() !== user.username) {
    const normalized = username.toLowerCase().trim();
    if (normalized.length < 3 || normalized.length > 30) throw new apiError(400, "Username must be 3–30 characters.");
    if (!/^[a-z0-9_]+$/.test(normalized)) throw new apiError(400, "Username can only contain letters, numbers, and underscores.");
    const wait = daysUntilUnlock(user.lastUsernameChangeAt, USERNAME_LOCKOUT_DAYS);
    if (wait > 0) throw new apiError(429, `Wait ${pluralize(wait)} before changing your username.`);
    const taken = await User.findOne({ username: normalized, _id: { $ne: user._id } });
    if (taken) throw new apiError(409, "Username already taken.");
    updates.username = normalized;
    updates.lastUsernameChangeAt = new Date();
  }

  // Avatar (no rate limit)
  if (typeof avatarUrl === "string" && avatarUrl !== user.avatarUrl) {
    updates.avatarUrl = avatarUrl;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(200).json(new apiResponse(200, "No changes.", user));
  }

  const updatedUser = await User.findByIdAndUpdate(user._id, { $set: updates }, { returnDocument: "after", runValidators: true });
  return res.status(200).json(new apiResponse(200, "Profile updated.", updatedUser));
});

export const updateAvatar = asyncHandler(async (req, res) => {
  const { image } = req.body;
  const user = req.user;

  if (!user) throw new apiError(404, "Profile not found.");
  if (!image || typeof image !== "string") throw new apiError(400, "No image provided.");

  const uploadResponse = await cloudinary.uploader.upload(image, {
    folder: "zync_avatars",
    transformation: [{ width: 512, height: 512, crop: "fill", gravity: "auto" }],
    quality: "auto:good",
  });

  // Clean up old avatar
  if (user.avatarPublicId) {
    try {
      await cloudinary.uploader.destroy(user.avatarPublicId);
    } catch (err) {
      console.error("Failed to remove old avatar:", err.message);
    }
  }

  user.avatarUrl = uploadResponse.secure_url;
  user.avatarPublicId = uploadResponse.public_id;
  await user.save();

  return res.status(200).json(new apiResponse(200, "Avatar updated.", user));
});

export const updatePublicKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) throw new apiError(400, "Public key is required.");

  const user = await User.findByIdAndUpdate(req.user._id, { publicKey }, { returnDocument: "after" });
  res.status(200).json(new apiResponse(200, "Public key updated.", user.publicKey));
});

export const updateFCMToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, { fcmToken: fcmToken || null }, { returnDocument: "after" });
  if (!user) throw new apiError(404, "User not found.");
  res.status(200).json(new apiResponse(200, "FCM token updated.", { fcmToken: user.fcmToken }));
});