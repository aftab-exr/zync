import { create } from "zustand";
import { generateKeyPair } from '../lib/crypto';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

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

            // ⚡ SYNC-CHECKER: local private key exists but the DB lost our public key.
            // The pair is broken → wipe local state and re-provision from scratch.
            if (privateKey && !dbPublicKey) {
                console.warn("⚠️ Key desync detected: local private key present but DB public key missing. Re-syncing...");
                localStorage.removeItem("zync_private_key");

                const keys = await generateKeyPair();
                localStorage.setItem("zync_private_key", keys.privateKey);
                // ✅ TRUE ROUTE (verified): POST /api/v1/users/keys → updatePublicKey
                try {
                    await api.post('/users/keys',
                        { publicKey: keys.publicKey },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                } catch (error) {
                    console.error("🔴 CRITICAL: FAILED TO SYNC PUBLIC KEY TO DB", error);
                }

                // Reflect the fresh public key in local state so the UI is consistent.
                set((state) => ({ user: state.user ? { ...state.user, publicKey: keys.publicKey } : state.user }));
                console.log("✅ Fresh E2E keypair generated and synced to database.");
                return;
            }

            if (!privateKey) {
                console.log("🔒 Generating new Zero-Knowledge Key Pair...");
                const keys = await generateKeyPair();

                // 2. Lock the private key in the device
                localStorage.setItem("zync_private_key", keys.privateKey);

                // 3. Upload the public key to MongoDB
                // ✅ TRUE ROUTE (verified): POST /api/v1/users/keys → updatePublicKey
                try {
                    await api.post('/users/keys',
                        { publicKey: keys.publicKey },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    console.log("✅ Public Key secured in database.");
                } catch (error) {
                    console.error("🔴 CRITICAL: FAILED TO SYNC PUBLIC KEY TO DB", error);
                }
            } else if (get().user && !get().user.publicKey) {
                // Restore public key coordinates from local private key coordinate components
                try {
                    const jwkPriv = JSON.parse(privateKey);
                    const jwkPub = {
                        kty: jwkPriv.kty,
                        crv: jwkPriv.crv,
                        x: jwkPriv.x,
                        y: jwkPriv.y
                    };
                    const pubKeyStr = JSON.stringify(jwkPub);
                    // ✅ TRUE ROUTE (verified): POST /api/v1/users/keys → updatePublicKey
                    await api.post('/users/keys',
                        { publicKey: pubKeyStr },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    console.log("✅ Public Key restored & secured in database.");
                } catch (err) {
                    console.error("🔴 CRITICAL: FAILED TO SYNC PUBLIC KEY TO DB", err);
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
                    console.warn("Profile not found. Redirecting to setup.");
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

                    console.warn("Popup auth blocked, falling back to redirect flow:", popupError.code);
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
        set({ isAuthenticated: false, user: null });
    }
}));