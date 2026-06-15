import { create } from "zustand";
import { generateKeyPair } from '../lib/crypto';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

// ⚡ Derive the public-key JWK string from a stored private-key JWK string.
// The public key is fully recoverable from the private key, so a missing/failed
// public key is NEVER a reason to touch the private key.
const derivePublicKeyFromPrivate = (privateKeyStr) => {
    const jwkPriv = JSON.parse(privateKeyStr);
    return JSON.stringify({
        kty: jwkPriv.kty,
        crv: jwkPriv.crv,
        x: jwkPriv.x,
        y: jwkPriv.y,
    });
};

// ⚡ THE RETRY PROTOCOL: upload the public key with bounded backoff.
// On persistent failure it sets a `zync_pending_key_upload` flag so the next
// boot/reconnect re-attempts, and it NEVER deletes the local private key —
// the failure is fully recoverable, the private key is not.
const uploadPublicKeyWithRetry = async (publicKey, token, attempts = 3) => {
    for (let i = 0; i < attempts; i++) {
        try {
            await api.post('/users/keys',
                { publicKey },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            localStorage.removeItem("zync_pending_key_upload");
            return true;
        } catch (error) {
            console.error(`🔴 Public key upload attempt ${i + 1}/${attempts} failed:`, error);
            if (i < attempts - 1) {
                // Linear backoff: 500ms, 1000ms — survives a brief network drop.
                await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
            }
        }
    }
    // Persistent failure → flag for retry on next boot. Private key stays intact.
    localStorage.setItem("zync_pending_key_upload", "1");
    return false;
};

export const useAuthStore = create((set, get) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    isLoggingIn: false,
    error: null,

    // ⚡ PHASE 3.0: E2E Key Initialization (+ DB-wipe Sync-Checker)
    // `dbPublicKey` is the public key the backend currently holds for this user.
    // If we have a local private key but the DB has lost the matching public key
    // (e.g. after a DB wipe / ghost-key reset), our keys are desynced and every
    // message would fail to decrypt — so we hard-reset to a fresh, synced pair.
    initializeE2E: async (token, dbPublicKey) => {
        try {
            // 1. Check if this device already has a private key
            let privateKey = localStorage.getItem("zync_private_key");

            // ⚡ HARDENED SYNC-CHECKER (non-destructive):
            // Local private key exists but the DB has no public key for us. The old
            // code wiped the private key and regenerated — permanently destroying the
            // ability to decrypt all prior messages. Instead, we RE-DERIVE the public
            // key from the existing private key and RE-UPLOAD it. The private key is
            // never touched.
            if (privateKey && !dbPublicKey) {
                // Safety guard: only act on a CONFIRMED profile that genuinely lacks a
                // public key — not a transient/partial read. checkAuth only reaches
                // here after a successful /users/me, and `dbPublicKey` is read from
                // that profile; if there's no user object yet, treat it as untrusted
                // and bail without changing anything.
                if (!get().user) {
                    console.warn("⚠️ Key re-sync skipped: no confirmed user profile (possible transient read). Will retry next boot.");
                    return;
                }

                console.warn("🟡 Key desync detected: DB missing public key. Re-deriving from local private key and re-uploading (private key preserved)...");
                try {
                    const pubKeyStr = derivePublicKeyFromPrivate(privateKey);
                    const ok = await uploadPublicKeyWithRetry(pubKeyStr, token);
                    if (ok) {
                        // Reflect the recovered public key in local state for UI consistency.
                        set((state) => ({ user: state.user ? { ...state.user, publicKey: pubKeyStr } : state.user }));
                    }
                    // If !ok, the pending flag is set; the next boot re-enters this same
                    // branch (DB still lacks the key) and retries. No data lost either way.
                } catch (err) {
                    // Malformed local private key — surface it, but NEVER delete it.
                    console.error("🔴 Could not derive public key from local private key:", err);
                }
                return;
            }

            if (!privateKey) {
                const keys = await generateKeyPair();

                // 2. Lock the private key in the device
                localStorage.setItem("zync_private_key", keys.privateKey);

                // 3. Upload the public key to MongoDB (retry on failure, never wipe).
                // ✅ TRUE ROUTE (verified): POST /api/v1/users/keys → updatePublicKey
                const ok = await uploadPublicKeyWithRetry(keys.publicKey, token);
                if (ok) {
                    set((state) => ({ user: state.user ? { ...state.user, publicKey: keys.publicKey } : state.user }));
                }
            } else if (get().user && !get().user.publicKey) {
                // Restore the public key by deriving it from the local private key.
                try {
                    const pubKeyStr = derivePublicKeyFromPrivate(privateKey);
                    // ✅ TRUE ROUTE (verified): POST /api/v1/users/keys → updatePublicKey
                    await uploadPublicKeyWithRetry(pubKeyStr, token);
                } catch (err) {
                    console.error("🔴 Failed to derive/sync public key from private key:", err);
                }
            }
        } catch (error) {
            console.error("🔴 E2E Initialization Failed:", error);
        }
    },
    // Algorithm: The Application Boot Sequence
    checkAuth: () => {
        // ⚡ ENTERPRISE FIX: Handle redirect result from browser returning from Google Auth
        getRedirectResult(auth).catch(err => {
            if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
                console.error("Auth popup was closed or cancelled");
            }
        });

        onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                return;
            }

            try {
                // ⚡ PWA OFFLINE BYPASS: When the device has no network, never hit the wire.
                // Mirror the last-known profile from local storage so airplane mode
                // doesn't nuke the session and bounce the user to /login.
                if (!navigator.onLine) {
                    try {
                        const cached = localStorage.getItem("zync_user_cache");
                        if (cached) {
                            const parsedCache = JSON.parse(cached);
                            set({ user: parsedCache, isAuthenticated: true, isCheckingAuth: false });
                            return;
                        }
                        // No mirror to fall back on — fail gracefully as unauthenticated.
                        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                        return;
                    } catch (cacheErr) {
                        console.error("🔴 Offline cache parse failed:", cacheErr);
                        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                        return;
                    }
                }

                const token = await firebaseUser.getIdToken();

                const res = await api.get('/users/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                // ⚡ ENTERPRISE FIX: Intercept new users upon return from Google
                if (res.data?.status === "REGISTRATION_REQUIRED") {
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                    return;
                }

                // Profile exists! Hydrate the state.
                // ⚡ PWA OFFLINE MIRROR: persist the live profile for offline boots.
                try {
                    localStorage.setItem("zync_user_cache", JSON.stringify(res.data.data));
                } catch (cacheErr) {
                    console.error("🔴 Failed to mirror profile to local cache:", cacheErr);
                }
                set({ user: res.data.data, isAuthenticated: true, isCheckingAuth: false });
                await get().initializeE2E(token, res.data.data.publicKey);

            } catch (error) {
                if (error.response?.status === 404 || error.response?.status === 403) {
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                } else {
                    console.error("Auth verification failed:", error);
                    set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                }
            }
        });
    },

    loginWithGoogle: async () => {
        try {
            set({ error: null, isLoggingIn: true });

            // ⚡ ENTERPRISE FIX: Hybrid Auth Flow - Try Popup First, Fallback to Redirect
            // Step 1: Attempt popup (works on most browsers, bypasses third-party cookies)
            try {
                await signInWithPopup(auth, googleProvider);
                // Success! Auth state listener (checkAuth) hydrates the user; the
                // Login page's effect on `isAuthenticated` performs the redirect.
                return;
            } catch (popupError) {
                // Step 2: If popup is blocked by privacy browser, fallback to redirect
                if (popupError.code === 'auth/popup-closed-by-user' ||
                    popupError.code === 'auth/cancelled-popup-request' ||
                    popupError.code === 'auth/operation-not-supported-in-this-environment') {

                    // Fallback to redirect for strict privacy browsers (Safari, Brave, Firefox)
                    await signInWithRedirect(auth, googleProvider);
                    // Note: Browser will navigate away; no code below executes
                    return;
                }
                // Re-throw unexpected errors
                throw popupError;
            }
        } catch (error) {
            console.error("Login failed:", error);
            set({ error: error.message });
            throw error;
        } finally {
            // ⚡ STICKING-BUTTON FIX: always release the spinner, even on the
            // popup success path — the navigation effect handles the redirect.
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        await signOut(auth);
        // ⚡ PWA OFFLINE MIRROR: clear the cached profile so it can't resurrect a stale session.
        localStorage.removeItem("zync_user_cache");
        // 🔒 DO NOT remove "zync_private_key" here. It is the ONLY copy of the user's
        // cryptographic identity (no server backup — see lib/crypto.js). Deleting it on
        // logout would permanently destroy the ability to decrypt all prior messages on
        // the next login. Logout clears session state only. A deliberate "forget this
        // device" action — with an explicit data-loss warning — is the only place a key
        // wipe belongs.
        set({ isAuthenticated: false, user: null });
    }
}));