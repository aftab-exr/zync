import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary from "../config/cloudinary.js";

// --- Profile mutation lockout windows (anti-spam) ---
const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_NAME_LOCKOUT_DAYS = 14;
const USERNAME_LOCKOUT_DAYS = 60;

// Returns whole days still remaining in a lockout window, or 0 if the window
// has elapsed (or was never started). `lastChangedAt` is a Date or null.
const daysUntilUnlock = (lastChangedAt, lockoutDays) => {
    if (!lastChangedAt) return 0; // never changed → first edit always allowed
    const remainingMs = lockoutDays * DAY_MS - (Date.now() - lastChangedAt.getTime());
    return remainingMs <= 0 ? 0 : Math.ceil(remainingMs / DAY_MS);
};

const pluralizeDays = (days) => `${days} ${days === 1 ? "day" : "days"}`;

export const setupProfile = asyncHandler(async (req, res, next) => {
    const { username, displayName, avatarUrl } = req.body;
    const { uid, email, emailVerified } = req.authContext;

    // Step 1: Username Validation (Live-check logic)
    if (!username || username.length < 3 || username.length > 30) {
        throw new apiError(400, "Username Must Be 3-30 Characters Long");
    }

    const usernameRegex = /^[a-z0-9_]+$/i;
    if (!usernameRegex.test(username)) {
        throw new apiError(400, "Username Can Only Contain Alphanumeric Characters and Underscores.");
    }

    // Step 2: Concurrent database checks
    const [existingUser, existingUsername] = await Promise.all([
        User.findOne({ firebaseUid: uid }),
        User.findOne({ username: username.toLowerCase() })
    ]);

    if (existingUser) {
        throw new apiError(400, "Profile Already Exists.");
    }

    if (existingUsername) {
        throw new apiError(409, "Username Already Exists.");
    }

    // Step 3: Database Insertion
    const newUser = await User.create({
        firebaseUid: uid,
        email,
        emailVerified,
        username: username.toLowerCase(),
        displayName,
        avatarUrl: avatarUrl || "",
    });

    // Step 4: Return sanitized user object
    return res.status(201).json(new apiResponse(201, "Profile Setup Successful.", newUser));
});

export const searchUsers = asyncHandler(async (req, res, next) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
        return res.status(200).json(new apiResponse(200, "Search results", []));
    }

    // Regex for prefix matching (case-insensitive)
    const searchRegex = new RegExp(`^${q}`, 'i');

    const users = await User.find({
        username: searchRegex,
        _id: { $ne: req.user._id }, // Don't return myself
        deletedAt: null
    })
    .select('username displayName avatarUrl status.lastSeen identityKeyPublic publicKey') // Only return public fields
    .limit(10);

    res.status(200).json(new apiResponse(200, "Search results", users));
});

export const getMe = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        // This triggers your frontend's setup redirect perfectly
        return res.status(200).json({ status: "REGISTRATION_REQUIRED" }); 
    }
    res.status(200).json(new apiResponse(200, "Profile fetched successfully", req.user));
});

// ⚡ Rate-limited profile mutation.
// displayName → 14-day lockout, username → 60-day lockout. Lockouts only fire
// when the field's value actually changes, so re-submitting the same value (or
// editing only the avatar) is always allowed. Timestamps are stamped only on a
// successful change, so a rejected request never resets the clock.
export const updateProfile = asyncHandler(async (req, res, next) => {
    const { displayName, username, avatarUrl } = req.body;
    const user = req.user;

    if (!user) {
        throw new apiError(404, "Profile not found. Please complete setup first.");
    }

    const updates = {};

    // --- Display Name (14-day lockout) ---
    if (typeof displayName === "string" && displayName.trim() !== user.displayName) {
        const trimmed = displayName.trim();
        if (trimmed.length < 1 || trimmed.length > 50) {
            throw new apiError(400, "Display name must be 1-50 characters long.");
        }

        const remainingDays = daysUntilUnlock(user.lastDisplayNameChangeAt, DISPLAY_NAME_LOCKOUT_DAYS);
        if (remainingDays > 0) {
            throw new apiError(429, `Please wait ${pluralizeDays(remainingDays)} before changing your display name again.`);
        }

        updates.displayName = trimmed;
        updates.lastDisplayNameChangeAt = new Date();
    }

    // --- Username (60-day lockout) ---
    if (typeof username === "string" && username.toLowerCase().trim() !== user.username) {
        const normalized = username.toLowerCase().trim();

        if (normalized.length < 3 || normalized.length > 30) {
            throw new apiError(400, "Username must be 3-30 characters long.");
        }
        if (!/^[a-z0-9_]+$/.test(normalized)) {
            throw new apiError(400, "Username can only contain alphanumeric characters and underscores.");
        }

        const remainingDays = daysUntilUnlock(user.lastUsernameChangeAt, USERNAME_LOCKOUT_DAYS);
        if (remainingDays > 0) {
            throw new apiError(429, `Please wait ${pluralizeDays(remainingDays)} before changing your username again.`);
        }

        // Uniqueness check (exclude myself).
        const taken = await User.findOne({ username: normalized, _id: { $ne: user._id } });
        if (taken) {
            throw new apiError(409, "Username already taken.");
        }

        updates.username = normalized;
        updates.lastUsernameChangeAt = new Date();
    }

    // --- Avatar URL (no rate limit) ---
    if (typeof avatarUrl === "string" && avatarUrl !== user.avatarUrl) {
        updates.avatarUrl = avatarUrl;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(200).json(new apiResponse(200, "No changes to apply.", user));
    }

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true }
    );

    return res.status(200).json(new apiResponse(200, "Profile updated successfully.", updatedUser));
});

// ⚡ Avatar upload. Accepts a base64 data URL, pushes it straight to Cloudinary
// (server-side square-crop keeps payloads light) and stores the secure URL on the
// existing `avatarUrl` field (the schema has no `profilePic`; the whole app reads
// `avatarUrl`). The previous asset is best-effort destroyed to avoid orphans.
export const updateAvatar = asyncHandler(async (req, res, next) => {
    const { image } = req.body;
    const user = req.user;

    if (!user) {
        throw new apiError(404, "Profile not found. Please complete setup first.");
    }
    if (!image || typeof image !== "string") {
        throw new apiError(400, "No image provided.");
    }

    const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "zync_avatars",
        // Lightweight: cap at 512² and auto-compress so we never store a heavy original.
        transformation: [{ width: 512, height: 512, crop: "fill", gravity: "auto" }],
        quality: "auto:good",
    });

    // Best-effort cleanup of the old avatar (never block the response on this).
    if (user.avatarPublicId) {
        try {
            await cloudinary.uploader.destroy(user.avatarPublicId);
        } catch (err) {
            console.error("⚠️ Failed to remove previous avatar from Cloudinary:", err.message);
        }
    }

    user.avatarUrl = uploadResponse.secure_url;
    user.avatarPublicId = uploadResponse.public_id;
    await user.save();

    return res.status(200).json(new apiResponse(200, "Avatar updated successfully.", user));
});

export const updatePublicKey = asyncHandler(async (req, res, next) => {
    const { publicKey } = req.body;
    const userId = req.user._id;

    if (!publicKey) {
        throw new apiError(400, "Public key is required");
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { publicKey },
        { returnDocument: 'after' }
    );

    res.status(200).json(new apiResponse(200, "Public key updated successfully", user.publicKey));
});

export const updateFCMToken = asyncHandler(async (req, res, next) => {
    const { fcmToken } = req.body;
    const userId = req.user._id;

    const user = await User.findByIdAndUpdate(
        userId,
        { fcmToken: fcmToken || null },
        { returnDocument: 'after' } // ⚡ CHANGED HERE
    );

    if (!user) {
        throw new apiError(404, "User not found");
    }

    res.status(200).json(new apiResponse(200, "FCM token updated successfully", { fcmToken: user.fcmToken }));
});