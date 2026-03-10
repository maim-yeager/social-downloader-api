/**
 * Facebook Service
 * ────────────────
 * Handles extraction of Facebook videos, reels, and watch URLs.
 *
 * Extraction chain:
 *   1. yt-dlp
 *   2. Open Graph HTML scrape + oEmbed
 *
 * NOTE: Facebook has strong anti-scraping measures.
 * yt-dlp with a valid Facebook session cookie (--cookies) yields
 * the best results for private or login-required content.
 */

'use strict';

const ytdlp    = require('../extractors/ytdlpExtractor');
const fallback = require('../extractors/fallbackExtractor');

/**
 * Detects Facebook content sub-type from URL.
 * @param {string} url
 * @returns {'reel'|'watch'|'video'}
 */
function detectSubType(url) {
  if (/\/reel\//i.test(url))    return 'reel';
  if (/\/watch/i.test(url))     return 'watch';
  return 'video';
}

/**
 * Main extraction entry point for Facebook.
 * @param {string} url Normalised Facebook URL
 * @returns {Promise<object>}
 */
async function extract(url) {
  const subType = detectSubType(url);

  // ── Attempt 1: yt-dlp ──────────────────────────────────────────────────────
  try {
    const result = await ytdlp.extract(url, 'facebook');
    result.type          = subType;
    result.extractorUsed = 'yt-dlp';
    return result;
  } catch (err) {
    console.warn('[facebook] yt-dlp failed:', err.message);
  }

  // ── Attempt 2: oEmbed / OG scrape ─────────────────────────────────────────
  try {
    const result = await fallback.extract(url, 'facebook');
    result.type          = subType;
    result.extractorUsed = 'fallback';
    return result;
  } catch (err) {
    throw new Error(`Facebook extraction failed: ${err.message}`);
  }
}

module.exports = { extract };
