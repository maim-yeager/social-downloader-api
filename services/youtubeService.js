/**
 * YouTube Service
 * ───────────────
 * Orchestrates extraction for YouTube URLs.
 * Handles: standard videos, Shorts, live streams, embeds.
 *
 * Extraction chain (first success wins):
 *   1. yt-dlp  (most reliable, requires binary)
 *   2. ytdl-core (pure JS, Vercel-compatible)
 */

'use strict';

const ytdlp    = require('../extractors/ytdlpExtractor');
const fallback = require('../extractors/fallbackExtractor');

/**
 * Detect YouTube media sub-type from URL.
 * @param {string} url
 * @returns {'short'|'live'|'video'}
 */
function detectSubType(url) {
  if (/\/shorts\//i.test(url))  return 'short';
  if (/\/live\//i.test(url))    return 'live';
  return 'video';
}

/**
 * Main extraction entry point for YouTube.
 * @param {string} url Normalised YouTube URL
 * @returns {Promise<object>}
 */
async function extract(url) {
  const subType = detectSubType(url);

  // ── Attempt 1: yt-dlp ──────────────────────────────────────────────────────
  try {
    const result = await ytdlp.extract(url, 'youtube');

    // Enrich type for Shorts
    if (subType === 'short') result.type = 'short';
    if (subType === 'live')  result.type = 'live';

    result.extractorUsed = 'yt-dlp';
    return result;
  } catch (err) {
    console.warn('[youtube] yt-dlp failed, trying ytdl-core:', err.message);
  }

  // ── Attempt 2: ytdl-core ───────────────────────────────────────────────────
  try {
    const result = await fallback.extract(url, 'youtube');
    if (subType === 'short') result.type = 'short';
    result.extractorUsed = 'ytdl-core';
    return result;
  } catch (err) {
    throw new Error(`YouTube extraction failed: ${err.message}`);
  }
}

module.exports = { extract };
