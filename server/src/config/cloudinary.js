import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 1. Reconstruct __dirname for ES Modules to find this exact file's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // This points directly to server/src/config

// 2. Force dotenv to read the .env file sitting right next to this file
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// 3. Debug logs to guarantee it's reading the correct file
console.log(`📂 Cloudinary checking for .env at: ${envPath}`);
console.log(`🔍 Cloudinary API Key Loaded: ${process.env.CLOUDINARY_API_KEY ? "✅ YES" : "❌ NO"}`);

// 4. Initialize the CDN
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;