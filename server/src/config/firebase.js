import admin from "firebase-admin";
import { createRequire } from "module";

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // ☁️ CLOUD DEPLOYMENT: Read the JSON directly from Render's memory
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // 💻 LOCAL DEVELOPMENT: Read from the local, securely git-ignored file
  const require = createRequire(import.meta.url);
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;