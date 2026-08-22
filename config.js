/**
 * Tajik AI - Configuration File (config.js)
 * 
 * Server-side Gemini API credentials should be placed in .env as GEMINI_API_KEY
 * or configured in Google AI Studio environment secrets.
 */

const CONFIG = {
  APP_NAME: "TAJIK AI",
  SUBTITLE: "Зеҳни сунъии тоҷикӣ",
  VERSION: "2.5.0",
  DEFAULT_LANGUAGE: "tg",
  // Fallback Gemini API Key placeholder for manual client-side overrides if needed:
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE",
  MODEL_NAME: "gemini-3.7-flash",
  API_BASE_URL: "/api",
};

export default CONFIG;
