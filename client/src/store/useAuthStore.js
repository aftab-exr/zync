import { create } from "zustand";
import { signInWithPopup, signOut} from "firebase/auth";
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