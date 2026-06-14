import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

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