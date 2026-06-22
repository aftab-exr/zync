export const PORT = process.env.PORT || 4000;

// -- CORS origins --
const strip = (v) => (v ? v.replace(/['"]/g, "").trim() : "");
const CLIENT_ORIGIN = strip(process.env.CLIENT_ORIGIN) || "http://localhost:5173";
const PRODUCTION_ORIGIN = strip(process.env.PRODUCTION_ORIGIN) || "https://zync-znty.onrender.com";

export function getAllowedOrigins() {
  const origins = [CLIENT_ORIGIN, PRODUCTION_ORIGIN].filter(Boolean);
  // Support 127.0.0.1 alongside localhost in dev
  if (CLIENT_ORIGIN.includes("localhost")) {
    origins.push(CLIENT_ORIGIN.replace("localhost", "127.0.0.1"));
  }
  return origins;
}

// -- Upload limits --
export const PAYLOAD_LIMIT = process.env.PAYLOAD_LIMIT || "10mb";
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// -- Profile rate-limiting --
export const DISPLAY_NAME_LOCKOUT_DAYS = 14;
export const USERNAME_LOCKOUT_DAYS = 60;

// -- Message editing --
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// -- AI config --
export const AI_MODEL = "llama-3.3-70b-versatile";
export const AI_SYSTEM_PROMPT =
  "You are Zync Intelligence, a concise and helpful AI embedded in an encrypted messaging app. Keep answers clean and code well-formatted.";