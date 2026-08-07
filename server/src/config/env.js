/**
 * Environment Variable Validator
 * Validates critical environment variables at application startup.
 * Fails fast with descriptive error messages if required settings are missing.
 */
export const validateEnv = () => {
  const required = [
    { key: "MONGO_URI", desc: "MongoDB Connection String" },
    { key: "JWT_SECRET", desc: "JSON Web Token Signing Key" },
  ];

  const missing = required.filter(({ key }) => !process.env[key] || !process.env[key].trim());

  if (missing.length > 0) {
    console.error("\n=======================================================");
    console.error("FATAL ERROR: MISSING REQUIRED ENVIRONMENT VARIABLES");
    missing.forEach(({ key, desc }) => {
      console.error(` - ${key}: ${desc}`);
    });
    console.error("Please configure these variables in server/src/config/.env");
    console.error("=======================================================\n");
    process.exit(1);
  }

  // Optional / feature-specific warnings
  if (!process.env.GROQ_API_KEY) {
    console.warn("[ENV WARNING] GROQ_API_KEY is not set. AI Chat Features will be disabled.");
  }

  if (!process.env.REDIS_URL) {
    console.warn("[ENV WARNING] REDIS_URL is not set. Socket.io will run in single-node mode.");
  }
};
