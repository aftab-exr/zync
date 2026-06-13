import { create } from "zustand";
import { generateKeyPair } from '../lib/crypto';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    error: null,

    // ⚡ PHASE 3.0: E2E Key Initialization
    initializeE2E: async (token) => {
        try {
            // 1. Check if this device already has a private key
            let privateKey = localStorage.getItem("zync_private_key");

            if (!privateKey) {
                console.log("🔒 Generating new Zero-Knowledge Key Pair...");
                const keys = await generateKeyPair();

                // 2. Lock the private key in the device
                localStorage.setItem("zync_private_key", keys.privateKey);

                // 3. Upload the public key to MongoDB
                await api.post('/users/keys',
                    { publicKey: keys.publicKey },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                console.log("✅ Public Key secured in database.");
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
                    await api.post('/users/keys',
                        { publicKey: pubKeyStr },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    console.log("✅ Public Key restored & secured in database.");
                } catch (err) {
                    console.error("Failed to restore public key from private key JWK:", err);
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
                set({ user: res.data.data, isAuthenticated: true, isCheckingAuth: false });
                await get().initializeE2E(token);

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
            set({ error: null });

            // ⚡ ENTERPRISE FIX: Hybrid Auth Flow - Try Popup First, Fallback to Redirect
            // Step 1: Attempt popup (works on most browsers, bypasses third-party cookies)
            try {
                await signInWithPopup(auth, googleProvider);
                // Success! Auth state listener will handle redirect
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
        }
    },

    logout: async () => {
        await signOut(auth);
        set({ isAuthenticated: false, user: null });
    }
}));