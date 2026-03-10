/**
 * Authentication Middleware
 * ─────────────────────────
 * Optional API-key gate.  Activated via REQUIRE_API_KEY=true in .env.
 * Keys are supplied in the API_KEYS environment variable as a
 * comma-separated list.
 *
 * Clients pass their key via:
 *   • Query param:  ?key=YOUR_KEY
 *   • HTTP header:  X-API-Key: YOUR_KEY
 *   • Bearer token: Authorization: Bearer YOUR_KEY
 */

'use strict';

// Parse the valid keys once at startup
const VALID_KEYS = new Set(
  (process.env.API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
);

const REQUIRE_API_KEY = process.env.REQUIRE_API_KEY === 'true';

/**
 * Express middleware that validates the supplied API key.
 * When REQUIRE_API_KEY is false the middleware is a no-op pass-through.
 */
function apiKeyAuth(req, res, next) {
  // Auth disabled → pass through
  if (!REQUIRE_API_KEY) return next();

  // No keys configured → warn and pass through (misconfiguration guard)
  if (VALID_KEYS.size === 0) {
    console.warn('[auth] REQUIRE_API_KEY=true but no API_KEYS are configured. Bypassing auth.');
    return next();
  }

  // Extract key from multiple possible locations
  const supplied =
    req.query.key ||
    req.headers['x-api-key'] ||
    extractBearer(req.headers.authorization);

  if (!supplied) {
    return res.status(401).json({
      status:  'error',
      code:    'MISSING_API_KEY',
      message: 'API key required. Pass it via ?key=, X-API-Key header, or Authorization: Bearer.',
    });
  }

  if (!VALID_KEYS.has(supplied)) {
    return res.status(403).json({
      status:  'error',
      code:    'INVALID_API_KEY',
      message: 'The provided API key is invalid.',
    });
  }

  // Key is valid — attach identity for downstream logging
  req.apiKey = supplied.slice(0, 8) + '…'; // log only prefix
  next();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBearer(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

module.exports = { apiKeyAuth };
