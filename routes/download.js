/**
 * Download Route
 * ──────────────
 * Handles  GET /download?url=MEDIA_URL[&key=API_KEY]
 *
 * Flow:
 *   1. Validate & sanitise URL
 *   2. Detect platform
 *   3. Check cache (return immediately on hit)
 *   4. Route to appropriate platform service
 *   5. Cache result
 *   6. Return structured JSON
 */

'use strict';

const express  = require('express');
const router   = express.Router();

const { detectPlatform, isValidUrl, getSupportedPlatforms } = require('../utils/platformDetector');
const cache    = require('../utils/cache');
const { downloadLimiter } = require('../utils/rateLimiter');
const { apiKeyAuth }      = require('../middleware/auth');

// Platform services
const youtube   = require('../services/youtubeService');
const tiktok    = require('../services/tiktokService');
const instagram = require('../services/instagramService');
const facebook  = require('../services/facebookService');

const SERVICE_MAP = {
  youtube,
  tiktok,
  instagram,
  facebook,
};

// ── Retry wrapper ─────────────────────────────────────────────────────────────

/**
 * Wraps a service call with simple retry logic.
 * @param {Function} fn     Async function to call
 * @param {number}   times  Max attempts
 * @param {number}   delayMs Delay between attempts
 */
async function withRetry(fn, times = 2, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= times; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < times) {
        console.warn(`[retry] attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms…`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

// ── Helper: format error response ────────────────────────────────────────────

function errorResponse(res, status, code, message, details = null) {
  const body = { status: 'error', code, message };
  if (details) body.details = details;
  return res.status(status).json(body);
}

// ── Main download handler ─────────────────────────────────────────────────────

/**
 * GET /download
 * Query params:
 *   url  {string} required – Media URL to extract
 *   key  {string} optional – API key (if auth is enabled)
 */
async function handleDownload(req, res) {
  const startTime = Date.now();
  const rawUrl    = (req.query.url || '').trim();

  // ── 1. URL presence check ──────────────────────────────────────────────────
  if (!rawUrl) {
    return errorResponse(res, 400, 'MISSING_URL',
      'Query parameter "url" is required.',
      { example: `${req.protocol}://${req.get('host')}/download?url=https://youtube.com/watch?v=dQw4w9WgXcQ` }
    );
  }

  // ── 2. URL format validation ───────────────────────────────────────────────
  if (!isValidUrl(rawUrl)) {
    return errorResponse(res, 400, 'INVALID_URL',
      'The provided URL is not valid. Ensure it starts with http:// or https://'
    );
  }

  // ── 3. Platform detection ──────────────────────────────────────────────────
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    return errorResponse(res, 400, 'UNSUPPORTED_PLATFORM',
      `Platform not supported. Supported platforms: ${getSupportedPlatforms().join(', ')}.`,
      { providedUrl: rawUrl }
    );
  }

  // ── 4. Cache lookup ────────────────────────────────────────────────────────
  const cacheKey  = cache.buildKey(platform.url);
  const cached    = cache.get(cacheKey);
  if (cached) {
    console.info(`[cache:hit] ${platform.id} — ${platform.url}`);
    return res.json({
      ...cached,
      _meta: { cached: true, platform: platform.id, processingMs: Date.now() - startTime },
    });
  }

  // ── 5. Extract ─────────────────────────────────────────────────────────────
  const service = SERVICE_MAP[platform.id];
  if (!service) {
    return errorResponse(res, 500, 'SERVICE_NOT_FOUND',
      `No service handler registered for platform: ${platform.id}`
    );
  }

  let result;
  try {
    result = await withRetry(
      () => service.extract(platform.url),
      2,      // max 2 attempts
      1500    // 1.5 s between retries
    );
  } catch (err) {
    console.error(`[extract:error] ${platform.id} — ${err.message}`);

    // Map common error patterns to user-friendly messages
    const msg = err.message || '';
    if (/private|login|authentication/i.test(msg)) {
      return errorResponse(res, 403, 'PRIVATE_CONTENT',
        'This content is private or requires authentication. Supply a valid session cookie via INSTAGRAM_SESSION_ID / TIKTOK_SESSION_ID in the server environment.',
        { platform: platform.id }
      );
    }
    if (/not found|404|removed|deleted/i.test(msg)) {
      return errorResponse(res, 404, 'CONTENT_NOT_FOUND',
        'The media could not be found. It may have been deleted or the URL is incorrect.',
        { url: rawUrl }
      );
    }
    if (/timeout|timed out/i.test(msg)) {
      return errorResponse(res, 504, 'EXTRACTION_TIMEOUT',
        'Media extraction timed out. Please try again in a moment.',
        { platform: platform.id }
      );
    }

    return errorResponse(res, 500, 'EXTRACTION_FAILED',
      'Failed to extract media. The platform may have changed or the URL is unavailable.',
      { platform: platform.id, detail: msg }
    );
  }

  // ── 6. Cache & return ──────────────────────────────────────────────────────
  cache.set(cacheKey, result);

  const processingMs = Date.now() - startTime;
  console.info(`[extract:ok] ${platform.id} in ${processingMs}ms — ${platform.url}`);

  return res.json({
    ...result,
    _meta: { cached: false, platform: platform.id, processingMs },
  });
}

// ── Route registration ────────────────────────────────────────────────────────

// Apply per-route rate limiter + auth, then handler
router.get('/', downloadLimiter, apiKeyAuth, handleDownload);

// Also expose as /api/download for clarity
module.exports = router;
