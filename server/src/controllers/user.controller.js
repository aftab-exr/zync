import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

export const setupProfile = asyncHandler(async (req, res, next) => {
    try {
        const { username, displayName, avatarUrl} = req.body;
        const {uid, email, emailVerified} = req.authContext;

        // Step 1: Check if this Firebase UID is already registered
        const existingUser = await User.findOne({ firebaseUid: uid });
        if (existingUser) {
            return res.status(400).json(new apiResponse(400, "Profile Already Existed.",{}));
        }
        // Step 2: Username Validation (Live-check logic)
        if(!username || username.length < 3 || username.length > 30){
            return res.status(400).json(new apiResponse(400, "Username Must Be 3-30 Characters Long",{}));
        }

        const usernameRegex = /^[a-z0-9_]+$/i;
        if(!usernameRegex.test(username)){
            return res.status(400).json(new apiResponse(400, "Username Can Only Contain Alphanumeric Characters and Underscores.",{}));
        }

        const existingUsername = await User.findOne({ username : username.toLowerCase() });
        if(existingUsername){
            return res.status(409).json(new apiResponse(409, "Username Already Exists.",{}));
        }
        // Step 3: Database Insertion
        const newUser = await User.create({
            firebaseUid: uid,
            email,
            emailVerified,
            username: username.toLowerCase(),
            displayName,
            avatarUrl: avatarUrl || "",
        })
        // Step 4: Return sanitized user object (exclude sensitive fields if necessary)
        return res.status(201)
        .json( new apiResponse(201, "Profile Setup Successful.", newUser) );
    } catch (error) {
        console.error("❌ Profile Setup Error:", error.stack || error);
        res.status(500).json(new apiResponse(500, "Internal Server Error", {}));
    }
})

export const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(200).json({ success: true, data: [] });
        }

        // Regex for prefix matching (case-insensitive)
        const searchRegex = new RegExp(`^${q}`, 'i');

        const users = await User.find({
            username: searchRegex,
            _id: { $ne: req.user._id }, // Don't return myself
            deletedAt: null
        })
        .select('username displayName avatarUrl status.lastSeen identityKeyPublic') // Only return public fields
        .limit(10);

        res.status(200).json({ success: true, data: users });
    } catch (error) {
        console.error("🔍 Search Error:", error.stack || error);
        res.status(500).json({ success: false, error: "Search failed" });
    }
};

export const getMe = asyncHandler(async (req, res) => {
    // If the middleware let them through, req.user is guaranteed to exist
    return res.status(200).json(new apiResponse(200, "Profile fetched successfully", req.user));
});