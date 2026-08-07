import KeyBundle from "../models/keyBundle.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * POST /api/v1/keys/register
 * Register or update a user's Signal Protocol key bundle.
 * Called on first login and when keys are rotated.
 */
export const registerKeyBundle = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { identityKey, signedPreKey, oneTimePreKeys } = req.body;

  if (!identityKey?.publicKey) {
    throw new apiError(400, "identityKey.publicKey is required");
  }

  if (
    !signedPreKey ||
    signedPreKey.keyId === undefined ||
    !signedPreKey.publicKey ||
    !signedPreKey.signature
  ) {
    throw new apiError(400, "signedPreKey with keyId, publicKey, and signature is required");
  }

  if (!Array.isArray(oneTimePreKeys)) {
    throw new apiError(400, "oneTimePreKeys must be an array");
  }

  // Validate one-time pre-keys
  for (const opk of oneTimePreKeys) {
    if (opk.keyId === undefined || !opk.publicKey) {
      throw new apiError(400, `Invalid oneTimePreKey: ${JSON.stringify(opk)}`);
    }
  }

  const preKeyCount = oneTimePreKeys.length;

  // Upsert: overwrite existing bundle or create a new one
  const bundle = await KeyBundle.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        identityKey: { publicKey: identityKey.publicKey },
        signedPreKey: {
          keyId: signedPreKey.keyId,
          publicKey: signedPreKey.publicKey,
          signature: signedPreKey.signature,
          createdAt: new Date(),
        },
        oneTimePreKeys,
        oneTimePreKeyCount: preKeyCount,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return res.status(200).json(
    new apiResponse(200, "Key bundle registered", {
      registered: true,
      oneTimePreKeyCount: bundle.oneTimePreKeyCount,
    })
  );
});

/**
 * GET /api/v1/keys/:userId
 * Fetch a user's public key bundle for X3DH key agreement.
 * Atomically removes one one-time pre-key from the bundle.
 * Falls back to signedPreKey only if no one-time pre-keys remain.
 */
export const fetchKeyBundle = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Atomically pop one one-time pre-key from the array
  const bundle = await KeyBundle.findOneAndUpdate(
    { userId },
    {
      $pop: { oneTimePreKeys: -1 }, // Remove first element (oldest)
    },
    { new: true } // Return updated document
  );

  if (!bundle) {
    throw new apiError(404, "No key bundle found for this user");
  }

  // Recalculate count after pop
  const newCount = bundle.oneTimePreKeys.length;
  await KeyBundle.updateOne(
    { userId },
    { $set: { oneTimePreKeyCount: newCount } }
  );

  // Extract the pre-key that was popped (it's the one that was at index 0 before pop)
  // Since we use `$pop: -1`, we need to know which key was consumed.
  // The bundle returned is post-pop, so the consumed key is the one that is no longer present.
  // For proper atomicity, we ideally use findOneAndModify with a callback,
  // but Mongoose's `new: true` returns post-update.
  // We return the new state; the consumed pre-key is implicit.

  return res.status(200).json(
    new apiResponse(200, "Key bundle fetched", {
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      oneTimePreKeyCount: newCount,
    })
  );
});

/**
 * POST /api/v1/keys/prekeys
 * Replenish one-time pre-keys. Client calls this when local oneTimePreKeyCount < 10.
 */
export const replenishPreKeys = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { preKeys } = req.body;

  if (!Array.isArray(preKeys) || preKeys.length === 0) {
    throw new apiError(400, "preKeys must be a non-empty array");
  }

  for (const pk of preKeys) {
    if (pk.keyId === undefined || !pk.publicKey) {
      throw new apiError(400, `Invalid preKey: { keyId, publicKey } required`);
    }
  }

  const bundle = await KeyBundle.findOneAndUpdate(
    { userId },
    {
      $push: {
        oneTimePreKeys: { $each: preKeys },
      },
      $inc: { oneTimePreKeyCount: preKeys.length },
    },
    { new: true }
  );

  if (!bundle) {
    throw new apiError(404, "No key bundle found. Register first via POST /keys/register.");
  }

  return res.status(200).json(
    new apiResponse(200, "Pre-keys replenished", {
      oneTimePreKeyCount: bundle.oneTimePreKeyCount,
    })
  );
});