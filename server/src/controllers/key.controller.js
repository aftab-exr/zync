import Key from "../models/key.model.js";
import User from "../models/user.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

// POST /api/v1/keys/register
export const registerKeyBundle = asyncHandler(async (req, res) => {
  const { identityKey, signedPreKey, oneTimePreKeys } = req.body;
  const userId = req.user._id;

  const keyDoc = await Key.findOneAndUpdate(
    { userId },
    {
      userId,
      identityKey,
      signedPreKey,
      oneTimePreKeys,
      oneTimePreKeyCount: oneTimePreKeys.length,
    },
    { upsert: true, new: true, runValidators: true }
  );

  // Update public identity key reference on user model as well
  await User.findByIdAndUpdate(userId, {
    identityKeyPublic: identityKey.publicKey,
    publicKey: identityKey.publicKey,
  });

  return res.status(200).json(new apiResponse(200, "Key bundle registered successfully", keyDoc));
});

// GET /api/v1/keys/:userId
export const getKeyBundle = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const keyDoc = await Key.findOne({ userId });
  if (!keyDoc) {
    throw new apiError(404, "Key bundle not found for user");
  }

  // Atomically pull one one-time prekey
  let consumedOneTimePreKey = null;
  if (keyDoc.oneTimePreKeys && keyDoc.oneTimePreKeys.length > 0) {
    consumedOneTimePreKey = keyDoc.oneTimePreKeys[0];

    await Key.updateOne(
      { userId },
      {
        $pop: { oneTimePreKeys: -1 }, // Remove first element
        $inc: { oneTimePreKeyCount: -1 },
      }
    );
  }

  return res.status(200).json(
    new apiResponse(200, "Key bundle retrieved", {
      userId: keyDoc.userId,
      identityKey: keyDoc.identityKey,
      signedPreKey: {
        keyId: keyDoc.signedPreKey.keyId,
        publicKey: keyDoc.signedPreKey.publicKey,
      },
      oneTimePreKey: consumedOneTimePreKey,
      remainingOneTimePreKeys: Math.max(0, keyDoc.oneTimePreKeyCount - (consumedOneTimePreKey ? 1 : 0)),
    })
  );
});

// POST /api/v1/keys/prekeys
export const replenishPreKeys = asyncHandler(async (req, res) => {
  const { preKeys } = req.body;
  const userId = req.user._id;

  const updatedDoc = await Key.findOneAndUpdate(
    { userId },
    {
      $push: { oneTimePreKeys: { $each: preKeys } },
      $inc: { oneTimePreKeyCount: preKeys.length },
    },
    { new: true }
  );

  return res.status(200).json(
    new apiResponse(200, "One-time pre-keys replenished", {
      oneTimePreKeyCount: updatedDoc ? updatedDoc.oneTimePreKeyCount : 0,
    })
  );
});
