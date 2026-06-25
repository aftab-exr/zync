import rateLimit from "express-rate-limit";
import apiResponse from "../utils/apiResponse.js";

export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next) => {
    res.status(429).json(new apiResponse(429, "Too many requests. Please try again in a minute."));
  }
});
