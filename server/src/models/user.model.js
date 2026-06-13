import mongoose, {Schema} from "mongoose";

const userSchema = new Schema({
    // --- Auth Identity (Sensitive - Never expose to client) ---
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, sparse: true },
  emailVerified: { type: Boolean, default: false },
  isAI: { type: Boolean, default: false },
  provider: { type: String, enum: ['google', 'email'], default: 'google' },

  // --- Public Profile ---
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    match: [/^[a-z0-9_]+$/, 'Username can only contain alphanumeric characters, hyphens, periods and underscores'],
    minlength: 3,
    maxlength: 30
  },
  displayName: { type: String, required: true, maxlength: 50 },
  avatarUrl: { type: String, default: '' },
  avatarPublicId: { type: String, default: '' }, 

  // --- WebRTC Public Keys (V1) ---
  publicKey: { type: String, default: "" },
  // --- Cryptography (V1) ---
  identityKeyPublic: { type: String, default: '' }, // Signal Identity Key (Base64)

  // --- Preferences & State ---
  settings: {
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
  },
  status: {
    online: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },

  // --- Security & Audit ---
  lastIp: { type: String }, // 30-day TTL index applied later
  deletedAt: { type: Date, default: null }, // Soft delete flag
},{
    timestamps:true
});

userSchema.index({ 'status.lastSeen': 1 });
userSchema.index({ deletedAt: 1 }); // Sparse index for soft-delete filtering

const User = mongoose.model("User", userSchema);

export default User;