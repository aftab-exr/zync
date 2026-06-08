import { create } from "zustand";
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    error: null,
    
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
                
            } catch (error) {
                if (error.response?.status === 401) {
                    set({ user: null, isAuthenticated: true, isCheckingAuth: false });
                } else {
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