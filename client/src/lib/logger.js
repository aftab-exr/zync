/**
 * Centralized logging utility for Zync Client
 * In development: logs to console with context
 * In production: could integrate with Sentry, LogRocket, etc.
 */

const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

function formatArgs(...args) {
  const timestamp = new Date().toISOString();
  return [`[${timestamp}]`, ...args];
}

export const logger = {
  debug: (...args) => {
    if (isDev) console.debug(...formatArgs(...args));
  },
  info: (...args) => {
    if (isDev) console.info(...formatArgs(...args));
  },
  warn: (...args) => {
    console.warn(...formatArgs(...args));
  },
  error: (...args) => {
    console.error(...formatArgs(...args));
    // In production, send to error tracking service
    if (isProd && window.Sentry) {
      window.Sentry.captureException(args.find(a => a instanceof Error) || new Error(args.join(' ')));
    }
  },
  // For crypto/key operations - always log in dev, warn in prod
  crypto: (...args) => {
    if (isDev) console.debug('[CRYPTO]', ...formatArgs(...args));
    else console.warn('[CRYPTO]', ...formatArgs(...args));
  },
  // For auth flow - always log
  auth: (...args) => {
    console.info('[AUTH]', ...formatArgs(...args));
  },
  // For network/API errors
  network: (...args) => {
    console.error('[NETWORK]', ...formatArgs(...args));
  },
};

export default logger;