import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { PORT } from "./constants/constants.js";
import { connectDB } from "../database/connection.js";
import http from "http";
import { initializeSocket } from "./socket/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "config", ".env")
});

const httpsServer = http.createServer(app);
initializeSocket(httpsServer);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Zync Server running on port ${PORT}`);
    console.log(`⚡ Real-Time Socket Engine Active`);
  });
});
