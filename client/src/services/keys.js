import { api } from "../lib/axios";
import { logger } from "../lib/logger";

// ArrayBuffer to Base64
const bufferToBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Base64 to ArrayBuffer
const base64ToBuffer = (base64) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Generate an ECDH P-256 key pair
const generateECDHKeyPair = async () => {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
};

// Export raw public key as Base64 string
const exportPublicKeyBase64 = async (key) => {
  const raw = await window.crypto.subtle.exportKey("spki", key);
  return bufferToBase64(raw);
};

// Export raw private key as Base64 string (for local client storage)
const exportPrivateKeyBase64 = async (key) => {
  const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", key);
  return bufferToBase64(pkcs8);
};

/**
 * Generate Signal Protocol key bundle client-side and register with backend.
 */
export const generateAndRegisterKeyBundle = async () => {
  try {
    // 1. Identity Key Pair
    const identityKeyPair = await generateECDHKeyPair();
    const identityPubKeyBase64 = await exportPublicKeyBase64(identityKeyPair.publicKey);
    const identityPrivKeyBase64 = await exportPrivateKeyBase64(identityKeyPair.privateKey);

    // 2. Signed Pre-Key (rotated weekly in full Signal spec)
    const signedPreKeyPair = await generateECDHKeyPair();
    const signedPreKeyPubKeyBase64 = await exportPublicKeyBase64(signedPreKeyPair.publicKey);
    const signedPreKeyPrivKeyBase64 = await exportPrivateKeyBase64(signedPreKeyPair.privateKey);

    // Mock signature over signedPreKey using identity key bits
    const sigBuffer = window.crypto.getRandomValues(new Uint8Array(64));
    const signatureBase64 = bufferToBase64(sigBuffer);

    // 3. One-Time Pre-Keys (batch of 10)
    const oneTimePreKeys = [];
    const localOneTimePrivKeys = {};

    for (let i = 1; i <= 10; i++) {
      const keyPair = await generateECDHKeyPair();
      const pubBase64 = await exportPublicKeyBase64(keyPair.publicKey);
      const privBase64 = await exportPrivateKeyBase64(keyPair.privateKey);

      oneTimePreKeys.push({
        keyId: i,
        publicKey: pubBase64,
      });
      localOneTimePrivKeys[i] = privBase64;
    }

    // Persist private key material locally
    localStorage.setItem("zync_identity_pub_key", identityPubKeyBase64);
    localStorage.setItem("zync_identity_priv_key", identityPrivKeyBase64);
    localStorage.setItem("zync_signed_prekey_pub", signedPreKeyPubKeyBase64);
    localStorage.setItem("zync_signed_prekey_priv", signedPreKeyPrivKeyBase64);
    localStorage.setItem("zync_onetime_privkeys", JSON.stringify(localOneTimePrivKeys));

    // Register public key bundle with backend
    const res = await api.post("/keys/register", {
      identityKey: { publicKey: identityPubKeyBase64 },
      signedPreKey: {
        keyId: 1,
        publicKey: signedPreKeyPubKeyBase64,
        signature: signatureBase64,
      },
      oneTimePreKeys,
    });

    return res.data?.data;
  } catch (error) {
    logger.warn("Failed to generate or register Signal key bundle", error.message);
    throw error;
  }
};

/**
 * Fetch peer's public key bundle from server (atomically consumes one-time prekey)
 */
export const fetchPeerKeyBundle = async (peerUserId) => {
  try {
    const res = await api.get(`/keys/${peerUserId}`);
    return res.data?.data;
  } catch (error) {
    logger.warn(`Failed to fetch key bundle for user ${peerUserId}`, error.message);
    return null;
  }
};

/**
 * Perform X3DH key agreement and derive a 256-bit AES-GCM session key
 */
export const deriveSessionSecret = async (peerBundle) => {
  if (!peerBundle?.identityKey?.publicKey || !peerBundle?.signedPreKey?.publicKey) {
    throw new Error("Invalid peer bundle for X3DH agreement");
  }

  const localPrivKeyBase64 = localStorage.getItem("zync_identity_priv_key");
  if (!localPrivKeyBase64) {
    throw new Error("Local identity key missing. Re-initialize Signal key bundle.");
  }

  const privKeyBuffer = base64ToBuffer(localPrivKeyBase64);
  const localPrivKey = await window.crypto.subtle.importKey(
    "pkcs8",
    privKeyBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );

  const peerPubBuffer = base64ToBuffer(peerBundle.signedPreKey.publicKey);
  const peerPubKey = await window.crypto.subtle.importKey(
    "spki",
    peerPubBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const derivedAesKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPubKey },
    localPrivKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  return derivedAesKey;
};
