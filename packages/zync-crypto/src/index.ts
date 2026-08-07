// Zync Crypto — Shared Cryptography Primitives
// Compatible with both browser (WebCrypto) and Node.js (globalThis.crypto.subtle)

export type CryptoKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type JWKKeyPair = {
  publicKey: string;  // JSON stringified JWK
  privateKey: string; // JSON stringified JWK
};

export type EncryptedPayload = {
  iv: string;         // base64
  ciphertext: string; // base64
};

export type SignalKeyBundle = {
  identityKey: string;           // base64 Ed25519 public key
  signedPreKey: {
    keyId: number;
    publicKey: string;           // base64 X25519 public key
    signature: string;           // base64 Ed25519 signature
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;           // base64 X25519 public key
  }>;
};

export type SessionKeys = {
  rootKey: CryptoKey;
  sendingChainKey: CryptoKey;
  receivingChainKey: CryptoKey;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  previousSendingChainLength: number;
};

/**
 * Generate an ECDH P-256 key pair for key agreement
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
}

// Alias for backward compatibility
export const generateKeyPair = generateECDHKeyPair;

/**
 * Export CryptoKey to JWK string
 */
export async function exportKeyToJWK(key: CryptoKey): Promise<string> {
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

/**
 * Import JWK string to CryptoKey
 */
export async function importKeyFromJWK(
  jwkString: string,
  usages: KeyUsage[] = []
): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return globalThis.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    usages
  );
}

// Aliases for backward compatibility
export const importPrivateKey = (jwkString: string) => importKeyFromJWK(jwkString, ['deriveKey', 'deriveBits']);
export const importPublicKey = (jwkString: string) => importKeyFromJWK(jwkString, []);

/**
 * Derive shared secret (AES-GCM 256) from local private key and remote public key
 */
export async function deriveSharedSecret(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random AES-GCM 256 key
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Aliases for backward compatibility
export const generateGroupSymmetricKey = generateAESKey;

/**
 * Export AES key to raw base64
 */
export async function exportAESKey(key: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

// Alias for backward compatibility
export const exportSymmetricKey = exportAESKey;

/**
 * Import raw base64 to AES key
 */
export async function importAESKey(base64: string): Promise<CryptoKey> {
  const raw = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Alias for backward compatibility
export const importSymmetricKey = importAESKey;

/**
 * Encrypt plaintext with AES-GCM key
 * Returns { iv: base64, ciphertext: base64 }
 */
export async function encryptText(text: string, key: CryptoKey): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

/**
 * Decrypt base64 payload with AES-GCM key
 */
export async function decryptText(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  try {
    const iv = new Uint8Array(atob(payload.iv).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(payload.ciphertext).split('').map(c => c.charCodeAt(0)));
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Decryption failed — key mismatch or corrupted data');
  }
}

/**
 * Generate a full Signal Protocol key bundle for a user
 * This creates: Identity Key (Ed25519), Signed Pre-Key (X25519), One-Time Pre-Keys (X25519)
 * Note: Full Signal Protocol requires libsignal-protocol-javascript for proper implementation
 * This is a simplified version using ECDH P-256 for key agreement
 */
export async function generateSignalKeyBundle(
  oneTimePreKeyCount: number = 100
): Promise<{
  identityKeyPair: CryptoKeyPair;
  signedPreKeyPair: CryptoKeyPair;
  signedPreKeySignature: string; // base64
  oneTimePreKeyPairs: CryptoKeyPair[];
}> {
  // Identity key (long-term, Ed25519 for signing)
  const identityKeyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  // Signed pre-key (medium-term, X25519 for key agreement)
  const signedPreKeyPair = await generateECDHKeyPair();

  // Sign the signed pre-key public key with identity key
  const signedPreKeyPublicJwk = await exportKeyToJWK(signedPreKeyPair.publicKey);
  const signedPreKeyPublicRaw = await globalThis.crypto.subtle.exportKey('raw', signedPreKeyPair.publicKey);
  const signature = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identityKeyPair.privateKey,
    signedPreKeyPublicRaw
  );

  // One-time pre-keys (short-term, X25519)
  const oneTimePreKeyPairs: CryptoKeyPair[] = [];
  for (let i = 0; i < oneTimePreKeyCount; i++) {
    oneTimePreKeyPairs.push(await generateECDHKeyPair());
  }

  return {
    identityKeyPair,
    signedPreKeyPair,
    signedPreKeySignature: btoa(String.fromCharCode(...new Uint8Array(signature))),
    oneTimePreKeyPairs
  };
}

/**
 * Perform X3DH key agreement (simplified)
 * Alice (initiator) uses her identity key + ephemeral key
 * Bob (recipient) provides his key bundle
 * Returns shared secret key for Double Ratchet initialization
 */
export async function performX3DH(
  aliceIdentityPrivateKey: CryptoKey,
  aliceEphemeralPrivateKey: CryptoKey,
  bobIdentityPublicKey: CryptoKey,
  bobSignedPreKeyPublicKey: CryptoKey,
  bobOneTimePreKeyPublicKey: CryptoKey | null
): Promise<CryptoKey> {
  // DH1 = DH(Alice_IK, Bob_SPK)
  const dh1 = await deriveSharedSecret(aliceIdentityPrivateKey, bobSignedPreKeyPublicKey);

  // DH2 = DH(Alice_EK, Bob_IK)
  const dh2 = await deriveSharedSecret(aliceEphemeralPrivateKey, bobIdentityPublicKey);

  // DH3 = DH(Alice_EK, Bob_SPK)
  const dh3 = await deriveSharedSecret(aliceEphemeralPrivateKey, bobSignedPreKeyPublicKey);

  // DH4 = DH(Alice_EK, Bob_OPK) if one-time pre-key exists
  let dh4: CryptoKey | null = null;
  if (bobOneTimePreKeyPublicKey) {
    dh4 = await deriveSharedSecret(aliceEphemeralPrivateKey, bobOneTimePreKeyPublicKey);
  }

  // Combine all DH outputs: HKDF(DH1 || DH2 || DH3 || DH4)
  // For simplicity, we derive a final key from the concatenation
  // In production, use proper HKDF with salt and info
  const dh1Raw = await globalThis.crypto.subtle.exportKey('raw', dh1);
  const dh2Raw = await globalThis.crypto.subtle.exportKey('raw', dh2);
  const dh3Raw = await globalThis.crypto.subtle.exportKey('raw', dh3);
  const dh4Raw = dh4 ? await globalThis.crypto.subtle.exportKey('raw', dh4) : new ArrayBuffer(0);

  const combined = new Uint8Array(
    dh1Raw.byteLength + dh2Raw.byteLength + dh3Raw.byteLength + dh4Raw.byteLength
  );
  combined.set(new Uint8Array(dh1Raw), 0);
  combined.set(new Uint8Array(dh2Raw), dh1Raw.byteLength);
  combined.set(new Uint8Array(dh3Raw), dh1Raw.byteLength + dh2Raw.byteLength);
  if (dh4Raw.byteLength > 0) {
    combined.set(new Uint8Array(dh4Raw), dh1Raw.byteLength + dh2Raw.byteLength + dh3Raw.byteLength);
  }

  // Import combined as key material and derive final AES key
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    combined,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // Zero salt for now; in production use proper salt
      info: new TextEncoder().encode('zync-x3dh-v1')
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Initialize Double Ratchet state from shared secret
 */
export function initializeRatchetState(sharedSecret: CryptoKey): SessionKeys {
  // In a real implementation, this would use HKDF to split the shared secret
  // into root key, sending chain key, receiving chain key
  // For now, we return a placeholder structure
  return {
    rootKey: sharedSecret,
    sendingChainKey: sharedSecret,
    receivingChainKey: sharedSecret,
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousSendingChainLength: 0
  };
}

/**
 * Ratchet forward: derive next message key from chain key
 */
export async function ratchetForward(chainKey: CryptoKey): Promise<{
  messageKey: CryptoKey;
  nextChainKey: CryptoKey;
}> {
  // Derive message key and next chain key using HKDF
  // Message key = HKDF(chainKey, info='message')
  // Next chain key = HKDF(chainKey, info='chain')
  const keyMaterial = await globalThis.crypto.subtle.exportKey('raw', chainKey);
  const imported = await globalThis.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const messageKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('message')
    },
    imported,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const nextChainKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('chain')
    },
    imported,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  return { messageKey, nextChainKey };
}

/**
 * Encrypt message with Double Ratchet (simplified)
 */
export async function encryptMessage(
  text: string,
  sessionKeys: SessionKeys
): Promise<{
  ciphertext: EncryptedPayload;
  messageNumber: number;
  updatedSessionKeys: SessionKeys;
}> {
  const { messageKey, nextChainKey } = await ratchetForward(sessionKeys.sendingChainKey);
  const payload = await encryptText(text, messageKey);

  return {
    ciphertext: payload,
    messageNumber: sessionKeys.sendingMessageNumber,
    updatedSessionKeys: {
      ...sessionKeys,
      sendingChainKey: nextChainKey,
      sendingMessageNumber: sessionKeys.sendingMessageNumber + 1
    }
  };
}

/**
 * Decrypt message with Double Ratchet (simplified)
 * Handles out-of-order messages by storing skipped message keys
 */
export async function decryptMessage(
  payload: EncryptedPayload,
  messageNumber: number,
  sessionKeys: SessionKeys,
  skippedMessageKeys: Map<number, CryptoKey>
): Promise<{
  plaintext: string;
  updatedSessionKeys: SessionKeys;
  updatedSkippedKeys: Map<number, CryptoKey>;
}> {
  // If we have a skipped key for this message number, use it
  if (skippedMessageKeys.has(messageNumber)) {
    const messageKey = skippedMessageKeys.get(messageNumber)!;
    skippedMessageKeys.delete(messageNumber);
    const plaintext = await decryptText(payload, messageKey);
    return {
      plaintext,
      updatedSessionKeys: sessionKeys,
      updatedSkippedKeys: skippedMessageKeys
    };
  }

  // Advance receiving chain until we reach the message number
  let currentChainKey = sessionKeys.receivingChainKey;
  let currentMessageNumber = sessionKeys.receivingMessageNumber;
  const newSkippedKeys = new Map(skippedMessageKeys);

  while (currentMessageNumber < messageNumber) {
    const { messageKey, nextChainKey } = await ratchetForward(currentChainKey);
    // Store skipped message key for potential out-of-order delivery
    newSkippedKeys.set(currentMessageNumber, messageKey);
    currentChainKey = nextChainKey;
    currentMessageNumber++;
  }

  // Now decrypt with the current message key
  const { messageKey, nextChainKey } = await ratchetForward(currentChainKey);
  const plaintext = await decryptText(payload, messageKey);

  return {
    plaintext,
    updatedSessionKeys: {
      ...sessionKeys,
      receivingChainKey: nextChainKey,
      receivingMessageNumber: messageNumber + 1
    },
    updatedSkippedKeys: newSkippedKeys
  };
}

/**
 * Utility: Generate random bytes as base64
 */
export function randomBytesBase64(length: number): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Utility: Convert base64 to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
}

/**
 * Utility: Convert Uint8Array to base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Derive conversation key for group chats
 * Uses the group's encrypted key payload and user's private key
 */
export async function deriveConversationKey(
  conversation: { encryptedGroupKeys?: Array<{ userId: string; encryptedKeyPayload: string }> },
  currentUser: { _id: string; publicKey: string }
): Promise<CryptoKey | null> {
  if (!conversation.encryptedGroupKeys?.length) return null;
  
  const privateKeyJwk = localStorage.getItem("zync_private_key");
  if (!privateKeyJwk) return null;
  
  // Find the key entry for current user
  const keyEntry = conversation.encryptedGroupKeys.find(
    (k) => k.userId === currentUser._id
  );
  if (!keyEntry?.encryptedKeyPayload) return null;
  
  try {
    const encryptedPayload = JSON.parse(keyEntry.encryptedKeyPayload);
    const myPrivKey = await importPrivateKey(privateKeyJwk);
    const theirPubKey = await importPublicKey(currentUser.publicKey);
    const wrapSecret = await deriveSharedSecret(myPrivKey, theirPubKey);
    const rawGroupKeyStr = await decryptText(encryptedPayload, wrapSecret);
    return await importSymmetricKey(rawGroupKeyStr);
  } catch {
    return null;
  }
}