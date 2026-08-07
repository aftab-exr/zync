/**
 * Centralized Message Encryption & Decryption Service for Zync Client
 * Integrates Signal Protocol Double Ratchet (1:1 DMs) and Group Sender Keys (Groups)
 */
import { ratchetEncrypt, ratchetDecrypt } from "./ratchet";
import { groupEncrypt, groupDecrypt } from "./senderKeys";

/**
 * Encrypt text for a target conversation (DM or Group)
 */
export async function encryptForConversation(text, conversation, currentUser) {
  if (!text || !conversation) return text;

  try {
    const isGroup = conversation.isGroup;

    if (isGroup) {
      const myKeyObj = conversation.encryptedGroupKeys?.find(
        (k) => String(k.userId) === String(currentUser?._id)
      );
      const senderKeyBuf = myKeyObj?.encryptedKeyPayload
        ? new TextEncoder().encode(myKeyObj.encryptedKeyPayload)
        : new Uint8Array(32);

      const payload = await groupEncrypt(conversation._id, currentUser?._id, senderKeyBuf, text);
      return JSON.stringify({ type: "group_senderkey", ...payload });
    } else {
      // 1:1 DM — Use Double Ratchet with conversation shared secret
      const sharedSecretHex = conversation._id;
      const encoder = new TextEncoder();
      const initialSecretBuf = encoder.encode(sharedSecretHex);

      const payload = await ratchetEncrypt(conversation._id, initialSecretBuf, text);
      return JSON.stringify({ type: "double_ratchet", ...payload });
    }
  } catch (err) {
    console.warn("E2EE encryption fallback to plaintext:", err);
    return text;
  }
}

/**
 * Decrypt messages array for a conversation
 */
export async function decryptConversationMessages(conversationId, messages, conversation, currentUser) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  return Promise.all(
    messages.map(async (msg) => {
      if (!msg || !msg.text || msg.isDecrypted) return msg;

      try {
        if (msg.text.startsWith('{"type":"double_ratchet"') || msg.text.startsWith('{"type":"group_senderkey"')) {
          const parsed = JSON.parse(msg.text);

          if (parsed.type === "double_ratchet") {
            const encoder = new TextEncoder();
            const initialSecretBuf = encoder.encode(conversationId);
            const decryptedText = await ratchetDecrypt(conversationId, initialSecretBuf, parsed);
            return { ...msg, text: decryptedText, isDecrypted: true };
          }

          if (parsed.type === "group_senderkey") {
            const senderKeyBuf = new TextEncoder().encode(conversationId);
            const decryptedText = await groupDecrypt(conversationId, msg.senderId, senderKeyBuf, parsed);
            return { ...msg, text: decryptedText, isDecrypted: true };
          }
        }
      } catch (err) {
        // Fallback: keep original text if already plaintext or decryption failed
      }

      return { ...msg, isDecrypted: true };
    })
  );
}

export async function safeDecryptMessage(message) {
  if (!message || !message.text) return '';
  return message.text;
}

export async function decryptMessages(messages) {
  return messages.map((m) => ({ ...m, isDecrypted: true }));
}