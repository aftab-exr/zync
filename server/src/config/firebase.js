import admin from "firebase-admin";
import { createRequire } from "module";

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Production deployment: load configuration from env variable
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Local development: load from serviceAccountKey.json
  const require = createRequire(import.meta.url);
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;