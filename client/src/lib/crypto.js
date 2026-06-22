/**
 * Cryptography helpers for Elliptic Curve Diffie-Hellman (ECDH) and AES-GCM.
 * Handles key generation, public/private key importing/exporting, secret derivation,
 * and text encryption/decryption.
 */

// Generate an ECDH P-256 key pair
export const generateKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
    );
    
    const exportedPublicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const exportedPrivateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    
    return { 
        publicKey: JSON.stringify(exportedPublicKey), 
        privateKey: JSON.stringify(exportedPrivateKey),
        rawKeys: keyPair
    };
};

// Import a stringified public JWK key
export const importPublicKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );
};

// Import a stringified private JWK key
export const importPrivateKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
};

// Derive a symmetric AES-GCM 256-bit shared key from a private key and public key
export const deriveSharedSecret = async (myPrivateKey, theirPublicKey) => {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

// Encrypt plaintext using a derived AES-GCM shared key
export const encryptText = async (text, sharedSecretKey) => {
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        encodedText
    );
    
    return {
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
};

// Decrypt a base64 payload using a derived AES-GCM shared key
export const decryptText = async (encryptedPayload, sharedSecretKey) => {
    try {
        const iv = new Uint8Array(atob(encryptedPayload.iv).split("").map(c => c.charCodeAt(0)));
        const ciphertext = new Uint8Array(atob(encryptedPayload.ciphertext).split("").map(c => c.charCodeAt(0)));
        
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            sharedSecretKey,
            ciphertext
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (error) {
        return "[Encrypted Message - Unreadable]";
    }
};

// Generate a raw AES-GCM 256-bit group key
export const generateGroupSymmetricKey = async () => {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

// Export an AES key to a raw Base64 string
export const exportSymmetricKey = async (key) => {
    const rawBuffer = await window.crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(rawBuffer)));
};

// Import a Base64 string back into an AES-GCM CryptoKey
export const importSymmetricKey = async (base64String) => {
    const raw = new Uint8Array(atob(base64String).split("").map(c => c.charCodeAt(0)));
    return await window.crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};