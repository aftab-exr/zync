import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
export const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid MongoDB ObjectId format" });

export const sendMessageSchema = z.object({
  params: z.object({
    conversationId: objectIdSchema,
  }),
  body: z.object({
    text: z.string().max(2000, "Message text cannot exceed 2000 characters").optional().nullable(),
    image: z.string().optional().nullable(),
    attachmentUrl: z.string().optional().nullable(),
    attachmentType: z.enum(["image", "video", "audio", ""]).optional().nullable(),
    attachmentMime: z.string().optional().nullable(),
    receiverId: objectIdSchema.optional().nullable(),
  }).refine(data => data.text || data.image || data.attachmentUrl, {
    message: "Message must contain text, an image, or an attachment.",
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    conversationId: z.string(),
  }),
  query: z.object({
    cursor: z.string().optional(),
    limit: z.string().regex(/^\d+$/).transform(val => parseInt(val, 10)).optional(),
    after: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid ISO date format" }).optional(),
  }),
});

export const editMessageSchema = z.object({
  params: z.object({
    messageId: objectIdSchema,
  }),
  body: z.object({
    text: z.string().min(1, "Message text cannot be empty").max(2000, "Message text cannot exceed 2000 characters"),
  }),
});

export const deleteMessageSchema = z.object({
  params: z.object({
    messageId: objectIdSchema,
  }),
});

export const createConversationSchema = z.object({
  body: z.object({
    receiverId: objectIdSchema,
  }),
});

export const createGroupConversationSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Group name is required").max(50, "Group name must be 50 characters or less"),
    participantIds: z.array(objectIdSchema).min(1, "At least 1 participant is required"),
    encryptedGroupKeys: z.array(
      z.object({
        userId: objectIdSchema,
        encryptedKeyPayload: z.string(),
      })
    ).optional(),
  }),
});

export const setupProfileSchema = z.object({
  body: z.object({
    username: z.string()
      .min(3, "Username must be 3–30 characters")
      .max(30, "Username must be 3–30 characters")
      .regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores"),
    displayName: z.string().min(1, "Display name is required").max(50, "Display name must be 50 characters or less"),
    avatarUrl: z.string().optional(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    username: z.string()
      .min(3, "Username must be 3–30 characters")
      .max(30, "Username must be 3–30 characters")
      .regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores")
      .optional(),
    displayName: z.string().min(1, "Display name must be at least 1 character").max(50, "Display name must be 50 characters or less").optional(),
    avatarUrl: z.string().optional(),
  }),
});

export const updatePublicKeySchema = z.object({
  body: z.object({
    publicKey: z.string().min(1, "Public key is required"),
  }),
});

export const updateFCMTokenSchema = z.object({
  body: z.object({
    fcmToken: z.string().nullable().optional(),
  }),
});
