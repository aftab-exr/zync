/**
 * ⚡ ZYNC ZERO-KNOWLEDGE ENGINE
 * Elliptic Curve Diffie-Hellman (ECDH) + AES-GCM
 */

// 1. Generate an unbreakable P-256 Key Pair
export const generateKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true, // extractable
        ["deriveKey", "deriveBits"]
    );
    
    // Convert Public Key to a string to save to MongoDB
    const exportedPublicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    
    // Convert Private Key to a string to save to LocalStorage (Never leaves device!)
    const exportedPrivateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    
    return { 
        publicKey: JSON.stringify(exportedPublicKey), 
        privateKey: JSON.stringify(exportedPrivateKey),
        rawKeys: keyPair
    };
};

// 2. Import stringified keys back into the Crypto Engine
export const importPublicKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );
};

export const importPrivateKey = async (jwkString) => {
    const jwk = JSON.parse(jwkString);
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
};

// 3. The Math: Combine My Private Key + Their Public Key = Shared Secret
export const deriveSharedSecret = async (myPrivateKey, theirPublicKey) => {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

// 4. Encrypt the Message
export const encryptText = async (text, sharedSecretKey) => {
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    
    // Create a random initialization vector for perfect forward secrecy
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedSecretKey,
        encodedText
    );
    
    // Package the IV and the Ciphertext together as Base64 strings
    return {
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
};

// 5. Decrypt the Message
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
        console.error("🔴 Decryption failed. Keys may not match.", error);
        return "[Encrypted Message - Unreadable]";
    }
};