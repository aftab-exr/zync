/**
 * ⚡ ZYNC ZERO-KNOWLEDGE MEDIA ENGINE
 * Binary AES-GCM encryption for images / video / voice notes.
 *
 * This is purely ADDITIVE to lib/crypto.js (text E2E) — it reuses the SAME
 * AES-GCM shared-secret CryptoKey the conversation already derives via ECDH
 * (1-on-1) or the wrapped group key, so no key management changes are needed.
 *
 * Wire format of an encrypted blob:  [ 12-byte IV ][ AES-GCM ciphertext ]
 */
import imageCompression from "browser-image-compression";
import { api } from "./axios";

// Downscale + recompress images on-device before encryption (max 20MB / 1920px).
// Non-images (video, audio) pass through untouched.
export const compressIfImage = async (file) => {
  if (!file?.type?.startsWith("image/")) return file;
  try {
    return await imageCompression(file, {
      maxSizeMB: 20,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    });
  } catch (err) {
    console.error("🔴 Image compression failed; using original:", err);
    return file;
  }
};

// Encrypt a File/Blob into a single opaque Blob (IV prepended to ciphertext).
export const encryptFile = async (file, sharedSecret) => {
  if (!sharedSecret) throw new Error("encryptFile: missing shared secret");

  const plainBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedSecret,
    plainBuffer
  );

  // Concatenate IV + ciphertext so the recipient can self-describe the payload.
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return new Blob([combined], { type: "application/octet-stream" });
};

// Inverse of encryptFile: returns a local `blob:` URL ready for <img>/<video>/<audio>.
// `mimeType` rebuilds the decrypted Blob with the correct content-type so the
// browser knows how to render it. Caller must URL.revokeObjectURL() when done.
export const decryptFile = async (encryptedBlob, sharedSecret, mimeType = "application/octet-stream") => {
  if (!sharedSecret) throw new Error("decryptFile: missing shared secret");

  const raw = new Uint8Array(await encryptedBlob.arrayBuffer());
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedSecret,
    ciphertext
  );

  const blob = new Blob([decrypted], { type: mimeType });
  return URL.createObjectURL(blob);
};

// Convenience: pull the encrypted asset from Cloudinary and decrypt it locally.
export const fetchAndDecrypt = async (url, sharedSecret, mimeType) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch encrypted media (${res.status})`);
  const encryptedBlob = await res.blob();
  return decryptFile(encryptedBlob, sharedSecret, mimeType);
};

// Upload an already-encrypted blob to the backend → Cloudinary (raw). Returns URL.
export const uploadEncryptedBlob = async (blob, token) => {
  const form = new FormData();
  // Filename is cosmetic; the payload is opaque ciphertext.
  form.append("file", blob, "zync_encrypted.bin");

  const res = await api.post("/messages/upload", form, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data?.data?.url;
};
