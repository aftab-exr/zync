/**
 * Server-side cryptography helpers for the AI Gateway.
 * Utilizes native Node.js WebCrypto (globalThis.crypto.subtle) with ECDH P-256 and AES-GCM 256.
 */

// Generate a fresh ECDH P-256 key pair for server identities
export const generateServerKeyPair = async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
    );
    const exportedPublicKey = await globalThis.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const exportedPrivateKey = await globalThis.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    return {
        publicKey: JSON.stringify(exportedPublicKey),
        privateKey: JSON.stringify(exportedPrivateKey)
    };
};

// Import a public JWK key string
export const importPublicKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await globalThis.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );
};

// Import a private JWK key string
export const importPrivateKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await globalThis.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
};

// Derive a symmetric AES-GCM shared key from local private key and remote public key
export const deriveSharedSecret = async (myPrivateKey, theirPublicKey) => {
    return await globalThis.crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

// Encrypt plaintext with derived AES-GCM shared key, returning base64 fields
export const encryptText = async (text, sharedSecretKey) => {
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        encodedText
    );
    return {
        iv: Buffer.from(iv).toString('base64'),
        ciphertext: Buffer.from(new Uint8Array(ciphertext)).toString('base64')
    };
};

// Decrypt base64 payload with derived AES-GCM shared key
export const decryptText = async (encryptedPayload, sharedSecretKey) => {
    try {
        const iv = new Uint8Array(Buffer.from(encryptedPayload.iv, 'base64'));
        const ciphertext = new Uint8Array(Buffer.from(encryptedPayload.ciphertext, 'base64'));
        const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            sharedSecretKey,
            ciphertext
        );
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (error) {
        console.error("AI Gateway Decryption failed:", error);
        return "[AI Gateway: Encrypted Message Unreadable]";
    }
};
