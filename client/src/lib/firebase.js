import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID    
};

const app = initializeApp(firebaseConfig);

// --- AUTH & GOOGLE LOGIN ---
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account"
});

// --- CLOUD MESSAGING (PWA PUSH NOTIFICATIONS) ---
export const messaging = getMessaging(app);
let messagingInstance = messaging;

export const requestPushPermission = async () => {
  try {
    const supported = await isSupported();
    if (!supported || !messagingInstance) {
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const currentToken = await getToken(messagingInstance, { 
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
      });
      
      if (currentToken) {
        return currentToken;
      } else {
        return null;
      }
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};

export const onForegroundMessage = (callback) => {
  if (!messagingInstance) {
    return () => {};
  }
  return onMessage(messagingInstance, (payload) => {
    callback(payload);
  });
};