import apiError from "../utils/apiError.js";

export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    // Assign parsed values back to requests to preserve transformed inputs (e.g. limit coerced to number)
    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;
    
    next();
  } catch (error) {
    if (error.errors) {
      const errorDetails = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return next(new apiError(400, "Validation failed", errorDetails));
    }
    return next(new apiError(400, error.message));
  }
};
