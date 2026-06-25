import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new apiError(400, "Invalid user session.");
  }

  const conversations = await Conversation.find({ participants: { $in: [userId] } })
    .populate("participants", "username displayName avatarUrl isAI status publicKey")
    .populate("lastMessageId")
    .sort({ lastMessageAt: -1 })
    .lean();

  res.status(200).json(new apiResponse(200, "Conversations fetched.", conversations));
});

export const createConversation = asyncHandler(async (req, res) => {
  const { receiverId } = req.body;
  const senderId = req.user?._id;

  if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) throw new apiError(400, "Invalid sender session.");
  if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) throw new apiError(400, "Invalid receiver ID.");
  if (senderId.toString() === receiverId.toString()) throw new apiError(400, "Cannot create conversation with yourself.");

  const receiver = await User.findOne({ _id: receiverId, deletedAt: null });
  if (!receiver) throw new apiError(404, "Receiver not found.");

  let conversation = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [senderId, receiverId] },
  });

  if (!conversation) {
    conversation = await Conversation.create({ participants: [senderId, receiverId], isGroup: false });
  }

  const populated = await conversation.populate("participants", "username displayName avatarUrl isAI status publicKey");
  res.status(201).json(new apiResponse(201, "Conversation ready.", populated));
});

export const createGroupConversation = asyncHandler(async (req, res) => {
  const { name, participantIds, encryptedGroupKeys } = req.body;
  const creatorId = req.user?._id;

  if (!creatorId || !mongoose.Types.ObjectId.isValid(creatorId)) throw new apiError(400, "Invalid session.");
  if (!name || typeof name !== "string" || !name.trim()) throw new apiError(400, "Group name is required.");

  const trimmedName = name.trim();
  if (trimmedName.length > 50) throw new apiError(400, "Group name must be 50 characters or less.");
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
    throw new apiError(400, "At least 1 other member required.");
  }

  for (const id of participantIds) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new apiError(400, `Invalid participant ID: ${id}`);
  }

  const allParticipants = [...new Set([...participantIds.map((id) => id.toString()), creatorId.toString()])];

  const validCount = await User.countDocuments({ _id: { $in: allParticipants }, deletedAt: null });
  if (validCount !== allParticipants.length) {
    throw new apiError(400, "One or more participants are invalid.");
  }

  const sanitizedKeys = Array.isArray(encryptedGroupKeys)
    ? encryptedGroupKeys.filter((k) => k && mongoose.Types.ObjectId.isValid(k.userId) && typeof k.encryptedKeyPayload === "string")
    : [];

  const group = await Conversation.create({
    isGroup: true,
    groupName: trimmedName,
    participants: allParticipants,
    groupAdmins: [creatorId],
    encryptedGroupKeys: sanitizedKeys,
  });

  const populated = await group.populate("participants", "username displayName avatarUrl isAI status publicKey");
  res.status(201).json(new apiResponse(201, "Group created.", populated));
});