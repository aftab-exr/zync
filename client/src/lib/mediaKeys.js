/**
 * Conversation key resolver for media encryption/decryption.
 * Resolves the AES-GCM CryptoKey for both 1-on-1 (via ECDH) and group chats.
 */
import {
  importPrivateKey,
  importPublicKey,
  deriveSharedSecret,
  importSymmetricKey,
  decryptText,
} from "./crypto";
import { sameId } from "./conversation";

export const deriveConversationKey = async (conversation, currentUser) => {
  if (!conversation || !currentUser) return null;

  const privateKeyJwk = localStorage.getItem("zync_private_key");
  if (!privateKeyJwk) return null;

  // Group: unwrap the shared AES-GCM group key
  if (conversation.isGroup) {
    const groupKeys = conversation.encryptedGroupKeys;
    if (!Array.isArray(groupKeys) || groupKeys.length === 0) return null;

    const myEntry = groupKeys.find((k) => sameId(k.userId, currentUser._id));
    if (!myEntry?.encryptedKeyPayload) return null;

    const creatorId = conversation.groupAdmins?.[0];
    const creator = conversation.participants?.find((p) => sameId(p._id, creatorId));
    if (!creator?.publicKey) return null;

    try {
      const myPriv = await importPrivateKey(privateKeyJwk);
      const creatorPub = await importPublicKey(creator.publicKey);
      const wrapSecret = await deriveSharedSecret(myPriv, creatorPub);

      const rawGroupKeyStr = await decryptText(JSON.parse(myEntry.encryptedKeyPayload), wrapSecret);
      if (!rawGroupKeyStr || rawGroupKeyStr === "[Encrypted Message - Unreadable]") return null;

      return await importSymmetricKey(rawGroupKeyStr);
    } catch (err) {
      console.error("Media: group key derivation failed:", err);
      return null;
    }
  }

  // 1-on-1: ECDH shared secret with the other participant
  const other = conversation.participants?.find((p) => !sameId(p._id, currentUser._id));
  if (!other?.publicKey) return null;

  try {
    const myPriv = await importPrivateKey(privateKeyJwk);
    const theirPub = await importPublicKey(other.publicKey);
    return await deriveSharedSecret(myPriv, theirPub);
  } catch (err) {
    console.error("Media: 1-on-1 key derivation failed:", err);
    return null;
  }
};
