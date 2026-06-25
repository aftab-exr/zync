import { create } from "zustand";
import { generateKeyPair } from '../lib/crypto';
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

// Track Firebase auth listener so we never register more than one
let _authUnsub = null;

// Recover public JWK key details from private key
const derivePublicKeyFromPrivate = (privateKeyStr) => {
    const jwkPriv = JSON.parse(privateKeyStr);
    return JSON.stringify({
        kty: jwkPriv.kty,
        crv: jwkPriv.crv,
        x: jwkPriv.x,
        y: jwkPriv.y,
    });
};

// Upload the public key with retry logic on connection failures
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
            if (i < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
            }
        }
    }
    localStorage.setItem("zync_pending_key_upload", "1");
    return false;
};

export const useAuthStore = create((set, get) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    isLoggingIn: false,
    error: null,

    // Set and cache the authenticated user profile locally
    setUser: (updatedUser) => {
        if (!updatedUser) return;
        try {
            localStorage.setItem("zync_user_cache", JSON.stringify(updatedUser));
        } catch (err) {
            // Handled silently
        }
        set({ user: updatedUser });
    },

    // Initialize E2E keys and verify sync with database state
    initializeE2E: async (token, dbPublicKey) => {
        try {
            let privateKey = localStorage.getItem("zync_private_key");
            let isKeyDesynced = false;

            if (privateKey && dbPublicKey) {
                try {
                    const pubFromPriv = derivePublicKeyFromPrivate(privateKey);
                    const parsedDerived = JSON.parse(pubFromPriv);
                    const parsedDb = JSON.parse(dbPublicKey);
                    if (parsedDerived.x !== parsedDb.x || parsedDerived.y !== parsedDb.y) {
                        isKeyDesynced = true;
                    }
                } catch (e) {
                    isKeyDesynced = true; 
                }
            }

            if (privateKey && (!dbPublicKey || isKeyDesynced)) {
                if (!get().user) {
                    return;
                }

                try {
                    const pubKeyStr = derivePublicKeyFromPrivate(privateKey);
                    const ok = await uploadPublicKeyWithRetry(pubKeyStr, token);
                    if (ok) {
                        set((state) => ({ user: state.user ? { ...state.user, publicKey: pubKeyStr } : state.user }));
                    }
                } catch (err) {
                    // Handled silently
                }
                return;
            }

            if (!privateKey) {
                const keys = await generateKeyPair();
                localStorage.setItem("zync_private_key", keys.privateKey);

                const ok = await uploadPublicKeyWithRetry(keys.publicKey, token);
                if (ok) {
                    set((state) => ({ user: state.user ? { ...state.user, publicKey: keys.publicKey } : state.user }));
                }
            } else if (get().user && !get().user.publicKey) {
                try {
                    const pubKeyStr = derivePublicKeyFromPrivate(privateKey);
                    await uploadPublicKeyWithRetry(pubKeyStr, token);
                } catch (err) {
                    // Handled silently
                }
            }
        } catch (error) {
            // Handled silently
        }
    },

    // Check Firebase and database authentication status
    checkAuth: () => {
        // Prevent stacking multiple listeners — only register once
        if (_authUnsub) return;
        _authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                return;
            }

            try {
                // If offline, bypass network call and load cached profile
                if (!navigator.onLine) {
                    try {
                        const cached = localStorage.getItem("zync_user_cache");
                        if (cached) {
                            const parsedCache = JSON.parse(cached);
                            set({ user: parsedCache, isAuthenticated: true, isCheckingAuth: false });
                            return;
                        }
                        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                        return;
                    } catch (cacheErr) {
                        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                        return;
                    }
                }

                const token = await firebaseUser.getIdToken();
                const res = await api.get('/users/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (res.data?.status === "REGISTRATION_REQUIRED") {
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                    return;
                }

                const profileData = res.data?.data;
                if (!res.data || typeof res.data !== 'object' || !profileData) {
                    throw new Error("Invalid profile response format from server");
                }

                try {
                    localStorage.setItem("zync_user_cache", JSON.stringify(profileData));
                } catch (cacheErr) {
                    // Handled silently
                }

                set({ user: profileData, isAuthenticated: true, isCheckingAuth: false });
                await get().initializeE2E(token, profileData.publicKey);

            } catch (error) {
                if (error.response?.status === 404 || error.response?.status === 403) {
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                } else {
                    set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                }
            }
        });
    },

    loginWithGoogle: async () => {
        try {
            set({ error: null, isLoggingIn: true });
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            set({ error: error.message });
            throw error;
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        if (_authUnsub) { _authUnsub(); _authUnsub = null; }
        await signOut(auth);
        localStorage.removeItem("zync_user_cache");
        set({ isAuthenticated: false, user: null });
    }
}));