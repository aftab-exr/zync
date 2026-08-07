/**
 * Binary AES-GCM encryption helpers for images, video, and audio assets.
 * Reuses the derived conversation/group AES-GCM shared key.
 */
import imageCompression from "browser-image-compression";
import { api } from "./axios";

// Compress images before encryption. Non-images pass through unchanged.
export const compressIfImage = async (file) => {
  if (!file?.type?.startsWith("image/")) return file;
  try {
    return await imageCompression(file, {
      maxSizeMB: 20,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    });
  } catch (err) {
    return file;
  }
};

// Encrypt a File or Blob with the shared secret key, prepending the 12-byte IV to the ciphertext
export const encryptFile = async (file, sharedSecret) => {
  if (!sharedSecret) throw new Error("encryptFile: missing shared secret");

  const plainBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedSecret,
    plainBuffer
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return new Blob([combined], { type: "application/octet-stream" });
};

// Decrypt an encrypted blob back to a local object URL with the correct MIME type
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

// Fetch encrypted binary data from a URL and decrypt it locally
export const fetchAndDecrypt = async (url, sharedSecret, mimeType) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch encrypted media (${res.status})`);
  const encryptedBlob = await res.blob();
  return decryptFile(encryptedBlob, sharedSecret, mimeType);
};

// Upload an encrypted binary blob to the server
export const uploadEncryptedBlob = async (blob, token) => {
  const form = new FormData();
  form.append("file", blob, "zync_encrypted.bin");

  const res = await api.post("/messages/upload", form, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data?.data?.url;
};