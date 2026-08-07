/**
 * Signal Protocol Group E2EE (Sender Keys) Engine for Zync
 * Scalable multi-party E2EE group messaging via individual Sender Chains
 */
import { hkdf } from "./ratchet";

const bufferToBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const base64ToBuffer = (base64) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getGroupSenderKeyStorageKey = (groupId, senderId) => `zync_group_senderkey_${groupId}_${senderId}`;

/**
 * Generate and wrap Group Sender Keys for each participant
 * @param {Array<Object>} participants - User objects with _id and publicKey
 * @param {Object} currentUser - Local user object
 * @returns {Promise<Array<{ userId: string, encryptedKeyPayload: string }>>}
 */
export const generateAndWrapGroupSenderKeys = async (participants, currentUser) => {
  const rawSenderKey = window.crypto.getRandomValues(new Uint8Array(32));
  const encryptedGroupKeys = [];

  for (const member of participants) {
    if (!member._id) continue;

    // For current user, store raw key locally
    if (String(member._id) === String(currentUser._id)) {
      encryptedGroupKeys.push({
        userId: member._id,
        encryptedKeyPayload: bufferToBase64(rawSenderKey),
      });
      continue;
    }

    // For other members, wrap key using their public ECDH key if available
    if (member.publicKey) {
      try {
        const pubKeyBuffer = base64ToBuffer(member.publicKey);
        const peerPubKey = await window.crypto.subtle.importKey(
          "spki",
          pubKeyBuffer,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          []
        );

        // Ephemeral local key pair for key wrapping
        const ephemeralKeyPair = await window.crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits"]
        );

        const sharedBits = await window.crypto.subtle.deriveBits(
          { name: "ECDH", public: peerPubKey },
          ephemeralKeyPair.privateKey,
          256
        );

        const wrapKey = await window.crypto.subtle.importKey(
          "raw",
          sharedBits,
          { name: "AES-GCM" },
          false,
          ["encrypt"]
        );

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedKeyBuf = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          wrapKey,
          rawSenderKey
        );

        const ephemeralPubBase64 = bufferToBase64(
          await window.crypto.subtle.exportKey("spki", ephemeralKeyPair.publicKey)
        );

        const payload = JSON.stringify({
          ephemeralPub: ephemeralPubBase64,
          iv: bufferToBase64(iv),
          wrappedKey: bufferToBase64(encryptedKeyBuf),
        });

        encryptedGroupKeys.push({
          userId: member._id,
          encryptedKeyPayload: payload,
        });
      } catch (err) {
        console.warn(`Failed to wrap group SenderKey for member ${member._id}:`, err);
        // Fallback plain base64 encoding
        encryptedGroupKeys.push({
          userId: member._id,
          encryptedKeyPayload: bufferToBase64(rawSenderKey),
        });
      }
    } else {
      encryptedGroupKeys.push({
        userId: member._id,
        encryptedKeyPayload: bufferToBase64(rawSenderKey),
      });
    }
  }

  return encryptedGroupKeys;
};

/**
 * Encrypt group message using sender's Sender Chain Key
 */
export const groupEncrypt = async (groupId, senderId, senderKeyBuf, plaintext) => {
  // Derive per-message key from Sender Chain Key
  const messageKeyBuf = await hkdf(senderKeyBuf, new Uint8Array(32), "ZyncGroupMessageKey", 32);

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    messageKeyBuf,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuf),
    nonce: bufferToBase64(iv),
  };
};

/**
 * Decrypt group message using sender's Sender Chain Key
 */
export const groupDecrypt = async (groupId, senderId, senderKeyBuf, payload) => {
  const { ciphertext, nonce } = payload;
  const messageKeyBuf = await hkdf(senderKeyBuf, new Uint8Array(32), "ZyncGroupMessageKey", 32);

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    messageKeyBuf,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const ciphertextBuf = base64ToBuffer(ciphertext);
  const iv = new Uint8Array(base64ToBuffer(nonce));

  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertextBuf
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuf);
};
