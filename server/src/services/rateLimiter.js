/**
 * Redis Sliding Window Rate Limiter
 * Replaces express-rate-limit with Redis-backed sliding window for distributed rate limiting
 * Supports both REST API and Socket.io events
 */
import Redis from "ioredis";
import { randomUUID } from "crypto";

// Redis client - will be initialized with REDIS_URL from env
let redisClient = null;

export const initRedisRateLimiter = (redisUrl) => {
  if (!redisUrl) {
    console.warn("REDIS_URL not configured, rate limiting will be disabled");
    return null;
  }
  
  redisClient = new Redis(redisUrl, { family: 4 });
  redisClient.on("error", (err) => console.error("Redis Rate Limiter Error:", err.message));
  return redisClient;
};

/**
 * Sliding window rate limiter using Redis sorted sets
 * @param {Object} options
 * @param {string} options.key - Unique identifier for the rate limit (e.g., "user:123", "ip:1.2.3.4")
 * @param {number} options.limit - Maximum requests allowed in the window
 * @param {number} options.windowMs - Time window in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number, retryAfterMs?: number}>}
 */
export const checkRateLimit = async ({ key, limit, windowMs }) => {
  if (!redisClient) {
    // Fallback: allow if Redis not configured
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs };
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  try {
    const pipeline = redisClient.pipeline();
    
    // Remove expired entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current requests in window
    pipeline.zcard(redisKey);
    
    // Add current request with timestamp as score
    const requestId = `${now}:${randomUUID()}`;
    pipeline.zadd(redisKey, now, requestId);
    
    // Set expiry on the key (windowMs + 1 second buffer)
    pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
    
    const results = await pipeline.exec();
    
    const currentCount = results[1][1]; // zcard result
    const allowed = currentCount < limit;
    const remaining = Math.max(0, limit - currentCount - 1);
    const resetAt = now + windowMs;

    if (!allowed) {
      // Remove the request we just added since it's over limit
      await redisClient.zrem(redisKey, requestId);
      // Get the oldest entry to calculate retry-after
      const oldest = await redisClient.zrange(redisKey, 0, 0, "WITHSCORES");
      const retryAfterMs = oldest.length > 0 ? (parseInt(oldest[1]) + windowMs - now) : windowMs;
      return { allowed: false, remaining: 0, resetAt, retryAfterMs };
    }

    return { allowed: true, remaining, resetAt };
  } catch (err) {
    console.error("Rate limit check failed:", err);
    // Fail open - allow request if Redis is down
    return { allowed: true, remaining: limit, resetAt: now + windowMs };
  }
};

/**
 * Express middleware factory for REST API rate limiting
 * @param {Object} options
 * @param {Function} options.keyGenerator - Function(req) => string (rate limit key)
 * @param {number} options.limit - Max requests per window
 * @param {number} options.windowMs - Time window in ms
 * @param {string} options.message - Error message
 */
export const createRateLimitMiddleware = ({ keyGenerator, limit, windowMs, message }) => {
  return async (req, res, next) => {
    const key = keyGenerator(req);
    const result = await checkRateLimit({ key, limit, windowMs });

    // Set rate limit headers
    res.setHeader("RateLimit-Limit", limit);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil((result.retryAfterMs || windowMs) / 1000));
      return res.status(429).json({
        success: false,
        error: message || "Too many requests",
        code: "RATE_LIMITED",
        retryAfterMs: result.retryAfterMs,
      });
    }

    next();
  };
};

/**
 * Socket.io rate limiter middleware
 * @param {Object} options
 * @param {Function} options.keyGenerator - Function(socket) => string (rate limit key)
 * @param {number} options.limit - Max events per window
 * @param {number} options.windowMs - Time window in ms
 * @param {string|string[]} options.eventNames - Event name(s) to limit (e.g., "message:send" or ["webrtc:call-user", "webrtc:answer-call"])
 */
export const createSocketRateLimitMiddleware = ({ keyGenerator, limit, windowMs, eventNames }) => {
  const events = Array.isArray(eventNames) ? eventNames : [eventNames];
  
  return (socket, next) => {
    // Wrap socket.emit and socket.on to track events
    const originalOn = socket.on.bind(socket);
    
    socket.on = (eventName, handler) => {
      if (events.some(e => eventName === e || (e.endsWith(':') && eventName.startsWith(e)))) {
        // Wrap the handler to check rate limit
        const rateLimitedHandler = async (...args) => {
          const key = keyGenerator(socket);
          const result = await checkRateLimit({ key, limit, windowMs });

          if (!result.allowed) {
            const error = new Error("Rate limited");
            error.code = "RATE_LIMITED";
            error.data = {
              message: `Too many ${eventName} events. Please slow down.`,
              retryAfterMs: result.retryAfterMs,
            };
            // Emit error event instead of calling handler
            socket.emit("error", error);
            return;
          }
          
          // Call original handler
          return handler(...args);
        };
        
        return originalOn(eventName, rateLimitedHandler);
      }
      
      return originalOn(eventName, handler);
    };
    
    next();
  };
};

// Pre-configured limiters for common use cases
export const restLimiters = {
  // Global API limiter: 200 req/min per IP
  global: createRateLimitMiddleware({
    keyGenerator: (req) => `ip:${req.ip}`,
    limit: 200,
    windowMs: 60 * 1000,
    message: "Too many requests. Please try again in a minute.",
  }),

  // Auth routes: 10 req/min per IP
  auth: createRateLimitMiddleware({
    keyGenerator: (req) => `ip:${req.ip}:auth`,
    limit: 10,
    windowMs: 60 * 1000,
    message: "Too many authentication attempts. Please try again in a minute.",
  }),

  // Message sending: 30 req/min per user
  messageSend: createRateLimitMiddleware({
    keyGenerator: (req) => `user:${req.user?._id || req.ip}:message`,
    limit: 30,
    windowMs: 60 * 1000,
    message: "Too many messages sent. Please slow down.",
  }),

  // Conversation creation: 20 req/min per user
  conversationCreate: createRateLimitMiddleware({
    keyGenerator: (req) => `user:${req.user?._id || req.ip}:conversation`,
    limit: 20,
    windowMs: 60 * 1000,
    message: "Too many conversations created. Please wait.",
  }),
};

export const socketLimiters = {
  // Message sending: 5 msg/s per user (sliding window 1s)
  messageSend: createSocketRateLimitMiddleware({
    keyGenerator: (socket) => `user:${socket.user?._id}:message`,
    limit: 5,
    windowMs: 1000,
    eventNames: "message:send",
  }),

  // Typing indicators: 10/s per user
  typing: createSocketRateLimitMiddleware({
    keyGenerator: (socket) => `user:${socket.user?._id}:typing`,
    limit: 10,
    windowMs: 1000,
    eventNames: "typing_start",
  }),

  // Call signaling: 20/s per user
  webrtc: createSocketRateLimitMiddleware({
    keyGenerator: (socket) => `user:${socket.user?._id}:webrtc`,
    limit: 20,
    windowMs: 1000,
    eventNames: ["webrtc:call-user", "webrtc:answer-call", "webrtc:ice-candidate", "webrtc:reject-call", "webrtc:end-call"],
  }),
};

export default {
  initRedisRateLimiter,
  checkRateLimit,
  createRateLimitMiddleware,
  createSocketRateLimitMiddleware,
  restLimiters,
  socketLimiters,
};