import { create } from "zustand";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";
import { logger } from "../lib/logger";
import { useSocketStore } from "./useSocketStore";

// Track Firebase auth listener so we never register more than one
let _authUnsub = null;

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
            logger.warn('Failed to cache user profile', err);
        }
        set({ user: updatedUser });
    },

    // Initialize E2E keys (no-op in plain text mode)
    initializeE2E: async () => {},

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
                    } catch {
                        set({ user: null, isAuthenticated: false, isCheckingAuth: false });
                        return;
                    }
                }

                // Get Firebase ID token and exchange for Zync JWT
                const firebaseIdToken = await firebaseUser.getIdToken();
                const res = await api.post('/auth/login', { firebaseIdToken });

                if (res.data?.data?.accessToken) {
                    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;
                }

                if (res.data?.data?.user) {
                    const profileData = res.data.data.user;
                    try {
                        localStorage.setItem("zync_user_cache", JSON.stringify(profileData));
                    } catch (err) {
                        logger.warn('Failed to cache user profile', err);
                    }

                    set({ user: profileData, isAuthenticated: true, isCheckingAuth: false });
                    await get().initializeE2E(profileData.publicKey);
                    useSocketStore.getState().connect();
                } else {
                    // Profile not set up yet
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                }

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
        await api.post('/auth/logout'); // Also revoke server-side refresh token
        localStorage.removeItem("zync_user_cache");
        set({ isAuthenticated: false, user: null });
    }
}));