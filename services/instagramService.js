/**
 * Instagram Service
 * ─────────────────
 * Handles extraction of Instagram posts, reels, carousels, and stories.
 *
 * Extraction chain:
 *   1. yt-dlp (with optional session cookie for private content)
 *   2. Open Graph HTML scrape
 *   3. oEmbed (metadata only)
 *
 * NOTE: Instagram aggressively rate-limits unauthenticated scrapers.
 * For reliable private content access, supply INSTAGRAM_SESSION_ID
 * in your .env file.
 */

'use strict';

const ytdlp    = require('../extractors/ytdlpExtractor');
const fallback = require('../extractors/fallbackExtractor');

/**
 * Detects the Instagram content sub-type from the URL.
 * @param {string} url
 * @returns {'reel'|'story'|'tv'|'post'}
 */
function detectSubType(url) {
  if (/\/reel[s]?\//i.test(url))   return 'reel';
  if (/\/stories\//i.test(url))    return 'story';
  if (/\/tv\//i.test(url))         return 'tv';
  return 'post';
}

/**
 * Main extraction entry point for Instagram.
 * @param {string} url Normalised Instagram URL
 * @returns {Promise<object>}
 */
async function extract(url) {
  const subType = detectSubType(url);

  // ── Attempt 1: yt-dlp ──────────────────────────────────────────────────────
  try {
    const result = await ytdlp.extract(url, 'instagram');
    result.type          = result.type === 'carousel' ? 'carousel' : subType;
    result.extractorUsed = 'yt-dlp';
    return result;
  } catch (err) {
    console.warn('[instagram] yt-dlp failed:', err.message);
  }

  // ── Attempt 2: HTML scrape / oEmbed ────────────────────────────────────────
  try {
    const result = await fallback.extract(url, 'instagram');
    if (result.type === 'video' && subType === 'reel') result.type = 'reel';
    result.extractorUsed = 'fallback';
    return result;
  } catch (err) {
    throw new Error(`Instagram extraction failed: ${err.message}`);
  }
}

module.exports = { extract };
