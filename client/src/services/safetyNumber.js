/**
 * Signal Protocol Safety Number (Fingerprint) calculation helper.
 * Computes SHA-256 hash over combined, sorted Identity Keys of two users.
 */

const bufferToHex = (buf) => {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Compute SHA-256 fingerprint for identity verification
 * @param {string} identityKeyA - Base64 public identity key of User A
 * @param {string} identityKeyB - Base64 public identity key of User B
 * @returns {Promise<{ rawHex: string, formattedDigits: string }>}
 */
export const computeSafetyNumber = async (identityKeyA, identityKeyB) => {
  if (!identityKeyA || !identityKeyB) {
    return { rawHex: "", formattedDigits: "00000 00000 00000 00000 00000 00000" };
  }

  // Sort keys lexicographically to ensure symmetric fingerprint regardless of call order
  const sortedKeys = [identityKeyA, identityKeyB].sort();
  const combined = sortedKeys.join(":");

  const encoder = new TextEncoder();
  const data = encoder.encode(combined);

  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const rawHex = bufferToHex(hashBuffer);

  // Format into 6 blocks of 5 digits for human comparison
  const digits = Array.from(new Uint8Array(hashBuffer))
    .slice(0, 15)
    .map((b) => (b % 100).toString().padStart(2, "0"))
    .join("");

  const formattedDigits = (
    digits.substring(0, 5) + " " +
    digits.substring(5, 10) + " " +
    digits.substring(10, 15) + " " +
    digits.substring(15, 20) + " " +
    digits.substring(20, 25) + " " +
    digits.substring(25, 30)
  ).trim();

  return { rawHex, formattedDigits };
};
