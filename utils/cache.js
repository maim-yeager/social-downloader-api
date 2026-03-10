/**
 * Cache Utility
 * ─────────────
 * In-memory LRU-style cache with TTL support.
 * Uses node-cache under the hood; wraps it in a clean API
 * and adds hit/miss statistics for monitoring.
 */

'use strict';

const NodeCache = require('node-cache');

// ── Configuration ─────────────────────────────────────────────────────────────

const TTL      = parseInt(process.env.CACHE_TTL_SECONDS  || '300', 10); // 5 min
const MAX_KEYS = parseInt(process.env.CACHE_MAX_KEYS     || '500', 10);

// ── Internal state ────────────────────────────────────────────────────────────

const store = new NodeCache({
  stdTTL:        TTL,
  checkperiod:   60,          // sweep for expired keys every 60 s
  maxKeys:       MAX_KEYS,
  useClones:     false,       // store references for perf (objects are read-only after set)
  deleteOnExpire: true,
});

let stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives a deterministic cache key from a URL string.
 * Strips tracking parameters that don't affect content identity.
 *
 * @param {string} url
 * @returns {string}
 */
function buildKey(url) {
  try {
    const u = new URL(url);
    // Remove common tracking / session params that shouldn't bust cache
    ['utm_source','utm_medium','utm_campaign','fbclid','igshid','si'].forEach(
      (p) => u.searchParams.delete(p)
    );
    return `dl:${u.toString()}`;
  } catch {
    // Fallback for malformed URLs
    return `dl:${url}`;
  }
}

/**
 * Retrieves a cached result.
 * @param {string} key
 * @returns {any | undefined}
 */
function get(key) {
  const value = store.get(key);
  if (value !== undefined) {
    stats.hits++;
    return value;
  }
  stats.misses++;
  return undefined;
}

/**
 * Stores a result in the cache.
 * @param {string} key
 * @param {any}    value
 * @param {number} [ttl]  Override TTL in seconds
 */
function set(key, value, ttl) {
  stats.sets++;
  if (ttl !== undefined) {
    store.set(key, value, ttl);
  } else {
    store.set(key, value);
  }
}

/**
 * Removes a specific key.
 * @param {string} key
 */
function del(key) {
  stats.deletes++;
  store.del(key);
}

/**
 * Flushes the entire cache (use sparingly).
 */
function flush() {
  store.flushAll();
  stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
}

/**
 * Returns cache health / statistics snapshot.
 * @returns {object}
 */
function getStats() {
  const nodeStats = store.getStats();
  return {
    keys:    store.keys().length,
    maxKeys: MAX_KEYS,
    ttl:     TTL,
    hits:    stats.hits,
    misses:  stats.misses,
    sets:    stats.sets,
    deletes: stats.deletes,
    hitRate: stats.hits + stats.misses > 0
      ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`
      : '0%',
    nodeCache: nodeStats,
  };
}

module.exports = { buildKey, get, set, del, flush, getStats };
