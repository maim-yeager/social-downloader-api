/**
 * Rate Limiter Utility
 * ─────────────────────
 * Provides two pre-configured limiters:
 *   • globalLimiter   – Applied to all routes
 *   • downloadLimiter – Stricter limit for the /download endpoint
 */

'use strict';

const rateLimit = require('express-rate-limit');

// ── Helper: build a standard "too many requests" response ────────────────────

function tooManyRequestsHandler(req, res) {
  res.status(429).json({
    status:   'error',
    code:     'RATE_LIMIT_EXCEEDED',
    message:  'Too many requests. Please slow down and try again later.',
    retryAfter: Math.ceil(
      (req.rateLimit.resetTime - Date.now()) / 1000
    ) + 's',
  });
}

// ── Global rate limiter ───────────────────────────────────────────────────────
// 100 requests per 15 minutes per IP across all routes

const globalLimiter = rateLimit({
  windowMs:         parseInt(process.env.RATE_LIMIT_WINDOW_MS     || '900000', 10),
  max:              parseInt(process.env.RATE_LIMIT_MAX_REQUESTS  || '100',    10),
  standardHeaders:  true,   // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders:    false,  // Disable the `X-RateLimit-*` headers
  handler:          tooManyRequestsHandler,
  skip: (req) => {
    // Skip rate limiting in test environments
    return process.env.NODE_ENV === 'test';
  },
});

// ── Download-specific limiter ─────────────────────────────────────────────────
// 20 download requests per 15 minutes per IP — more aggressive

const downloadLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,   // 15 minutes
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         tooManyRequestsHandler,
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    // Use API key as rate-limit key when available (fairer for shared IPs)
    const apiKey = req.query.key || req.headers['x-api-key'];
    return apiKey || req.ip;
  },
});

module.exports = { globalLimiter, downloadLimiter };
