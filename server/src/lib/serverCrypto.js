/**
 * ⚡ ZYNC SERVER-SIDE ZERO-KNOWLEDGE ENGINE
 * Node 24 native WebCrypto implementation for the AI Gateway.
 */
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

export const importPublicKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await globalThis.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );
};

export const importPrivateKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await globalThis.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
};

export const deriveSharedSecret = async (myPrivateKey, theirPublicKey) => {
    return await globalThis.crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

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
        console.error("🔴 AI Gateway Decryption failed:", error);
        return "[AI Gateway: Encrypted Message Unreadable]";
    }
};
