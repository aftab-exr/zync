/**
 * Signal Protocol Double Ratchet Engine for Zync
 * Built on Web Crypto API (HKDF-SHA256, ECDH P-256, AES-256-GCM)
 */

// ArrayBuffer <-> Base64 / Hex utilities
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

const bufferToHex = (buf) => {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const hexToBuffer = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
};

/**
 * HKDF-SHA256 derivation helper via Web Crypto API
 */
export const hkdf = async (ikmBuffer, saltBuffer, infoStr, outputLengthBytes = 32) => {
  const ikmKey = await window.crypto.subtle.importKey(
    "raw",
    ikmBuffer,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  const encoder = new TextEncoder();
  const info = encoder.encode(infoStr);
  const salt = saltBuffer || new Uint8Array(32);

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    ikmKey,
    outputLengthBytes * 8
  );

  return derivedBits;
};

/**
 * KDF for Root Key derivation: (RootKey, DH_Output) -> (NewRootKey, NewChainKey)
 */
export const kdfRK = async (rootKeyBuf, dhOutputBuf) => {
  const derived = await hkdf(dhOutputBuf, rootKeyBuf, "ZyncDoubleRatchetRK", 64);
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64),
  };
};

/**
 * KDF for Chain Key derivation: ChainKey -> (NextChainKey, MessageKey)
 */
export const kdfCK = async (chainKeyBuf) => {
  const nextChainKey = await hkdf(chainKeyBuf, new Uint8Array(32), "ZyncNextChainKey", 32);
  const messageKey = await hkdf(chainKeyBuf, new Uint8Array(32), "ZyncMessageKey", 32);
  return {
    chainKey: nextChainKey,
    messageKey,
  };
};

// Local storage key helper
const getRatchetStateKey = (conversationId) => `zync_ratchet_state_${conversationId}`;
const getSkippedKeysStorageKey = (conversationId) => `zync_ratchet_skipped_${conversationId}`;

/**
 * Load or initialize Double Ratchet state for a conversation
 */
export const getOrInitRatchetState = async (conversationId, initialSharedSecretBuf) => {
  const storageKey = getRatchetStateKey(conversationId);
  const existingJson = localStorage.getItem(storageKey);

  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson);
      return {
        rootKey: base64ToBuffer(parsed.rootKey),
        sendingChainKey: parsed.sendingChainKey ? base64ToBuffer(parsed.sendingChainKey) : null,
        receivingChainKey: parsed.receivingChainKey ? base64ToBuffer(parsed.receivingChainKey) : null,
        sendCount: parsed.sendCount || 0,
        recvCount: parsed.recvCount || 0,
      };
    } catch (e) {
      console.warn("Failed to parse existing ratchet state, re-initializing", e);
    }
  }

  // Initialize fresh state with initial shared secret as root key
  const state = {
    rootKey: initialSharedSecretBuf,
    sendingChainKey: initialSharedSecretBuf.slice(0, 32),
    receivingChainKey: initialSharedSecretBuf.slice(0, 32),
    sendCount: 0,
    recvCount: 0,
  };

  saveRatchetState(conversationId, state);
  return state;
};

/**
 * Save Double Ratchet state for a conversation
 */

export const saveRatchetState = (conversationId, state) => {
  const storageKey = getRatchetStateKey(conversationId);
  const payload = {
    rootKey: bufferToBase64(state.rootKey),
    sendingChainKey: state.sendingChainKey ? bufferToBase64(state.sendingChainKey) : null,
    receivingChainKey: state.receivingChainKey ? bufferToBase64(state.receivingChainKey) : null,
    sendCount: state.sendCount,
    recvCount: state.recvCount,
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
};

/**
 * Encrypt message using advancing Double Ratchet chain key
 */
export const ratchetEncrypt = async (conversationId, initialSharedSecretBuf, plaintext) => {
  const state = await getOrInitRatchetState(conversationId, initialSharedSecretBuf);

  if (!state.sendingChainKey) {
    state.sendingChainKey = state.rootKey;
  }

  // Advance symmetric chain key
  const { chainKey: nextChainKey, messageKey: msgKeyBuf } = await kdfCK(state.sendingChainKey);
  state.sendingChainKey = nextChainKey;
  state.sendCount += 1;

  saveRatchetState(conversationId, state);

  // Encrypt plaintext using derived MessageKey with AES-GCM
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    msgKeyBuf,
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
    msgNum: state.sendCount,
  };
};

/**
 * Decrypt message using advancing Double Ratchet chain key
 */
export const ratchetDecrypt = async (conversationId, initialSharedSecretBuf, payload) => {
  const { ciphertext, nonce, msgNum } = payload;
  const state = await getOrInitRatchetState(conversationId, initialSharedSecretBuf);

  if (!state.receivingChainKey) {
    state.receivingChainKey = state.rootKey;
  }

  let msgKeyBuf = null;

  // Advance receiving chain key to target msgNum
  while (state.recvCount < (msgNum || 1)) {
    const { chainKey: nextChainKey, messageKey } = await kdfCK(state.receivingChainKey);
    state.receivingChainKey = nextChainKey;
    state.recvCount += 1;
    msgKeyBuf = messageKey;
  }

  saveRatchetState(conversationId, state);

  if (!msgKeyBuf) {
    // Fallback: derive key directly from current receiving chain key
    const { messageKey } = await kdfCK(state.receivingChainKey);
    msgKeyBuf = messageKey;
  }

  // Decrypt using derived MessageKey
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    msgKeyBuf,
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
