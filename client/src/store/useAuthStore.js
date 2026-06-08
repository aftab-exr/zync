import { create } from "zustand";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { api } from "../lib/axios";

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    error: null,
    
    // Algorithm: The Application Boot Sequence
    checkAuth: () => {
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
            
            // ⚡ ENTERPRISE FIX: Secure Popup Flow (bypasses third-party cookie blockers)
            await signInWithPopup(auth, googleProvider);
            
            // Note: Success - the Firebase auth state will trigger checkAuth listener,
            // and AuthGuard will handle the redirect based on user profile status.
        } catch (error) {
            console.error("Login failed:", error);
            set({ error: error.message });
            throw error; // Propagate error to UI for proper error handling
        } 
    },

    logout: async () => {
        await signOut(auth);
        set({ isAuthenticated: false, user: null });
    }
}));