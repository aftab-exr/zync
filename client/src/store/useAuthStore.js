import { create } from "zustand";
import { signInWithPopup, signOut, onAuthStateChanged} from "firebase/auth";
import { auth, googleProvider} from "../lib/firebase";
import axios from "axios";

const api = axios.create({
    baseURL: "http:localhost:4000/api/v1"
});

export const useAuthStore = create((set, get) => ({
    user: null,
    isAuthenticated: false,
    isCheckingAuth: true,
    error: null,
    
    // Algorithm: The Application Boot Sequence
    checkAuth: () => {
        // Firebase actively monitors the IndexedDB session across reloads
        onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
            set({ user: null, isAuthenticated: false, isCheckingAuth: false });
            return;
        }

        try {
            const token = await firebaseUser.getIdToken();
            
            // Ask the backend for the Zync Profile
            const res = await axios.get('http://localhost:4000/api/v1/users/me', {
            headers: { Authorization: `Bearer ${token}` }
            });
            
            // Profile exists! Hydrate the state.
            set({ user: res.data.data, isAuthenticated: true, isCheckingAuth: false });
            
        } catch (error) {
            // If 401, Firebase is valid but MongoDB profile is missing (Needs Setup)
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
            const result = await signInWithPopup(auth, googleProvider);
            const idToken = await result.user.getIdToken();
            const response = await api.get('/users/me', {
                headers: { Authorization: `Bearer ${idToken}` }
            });
            if (response.data.status === "REGISTRATION_REQUIRED") {
                set({ isAuthenticated: true, user: null });
                return { step: 'setup-profile', token: idToken };
            }
            set({ isAuthenticated: true, user: response.data.data });
            return { step: 'inbox' };
        } catch (error) {
            console.error("Login failed:", error);
            set({ error: error.message });
            return { step: 'error' };
        } 
    },
    logout: async () => {
        await signOut(auth);
        set({ isAuthenticated: false, user: null });
    }
}));