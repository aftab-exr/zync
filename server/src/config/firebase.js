// server/src/config/firebase.js
import admin from "firebase-admin";
import { createRequire } from "module";

// In modern ES Modules, we use createRequire to cleanly load JSON files
const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("🔥 Firebase Admin Engine Initialized");

export default admin;