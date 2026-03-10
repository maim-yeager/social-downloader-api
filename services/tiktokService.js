/**
 * TikTok Service
 * ──────────────
 * Handles TikTok video, image-carousel, and story extraction.
 *
 * Extraction chain:
 *   1. yt-dlp  (handles redirect short links + no-watermark streams)
 *   2. tikwm public API  (no-watermark, image carousels)
 *   3. oEmbed  (metadata only, last resort)
 *
 * Short/redirect links (vm.tiktok.com, vt.tiktok.com) are resolved
 * before extraction so every extractor receives the canonical URL.
 */

'use strict';

const axios    = require('axios');
const ytdlp    = require('../extractors/ytdlpExtractor');
const fallback = require('../extractors/fallbackExtractor');

const TIMEOUT  = parseInt(process.env.EXTRACTION_TIMEOUT_MS || '30000', 10);

const http = axios.create({
  timeout: TIMEOUT,
  maxRedirects: 10,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves short TikTok redirect URLs to canonical form.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function resolveRedirect(url) {
  if (!/vm\.tiktok|vt\.tiktok|tiktok\.com\/t\//i.test(url)) return url;
  try {
    const resp = await http.head(url);
    return resp.request?.res?.responseUrl || resp.config?.url || url;
  } catch (e) {
    console.warn('[tiktok] redirect resolution failed:', e.message);
    return url;
  }
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Extracts TikTok media.
 * @param {string} url Normalised TikTok URL
 * @returns {Promise<object>}
 */
async function extract(url) {
  const resolvedUrl = await resolveRedirect(url);

  // ── Attempt 1: yt-dlp ──────────────────────────────────────────────────────
  try {
    const result = await ytdlp.extract(resolvedUrl, 'tiktok');
    result.extractorUsed = 'yt-dlp';
    return result;
  } catch (err) {
    console.warn('[tiktok] yt-dlp failed:', err.message);
  }

  // ── Attempt 2: fallback (tikwm + oEmbed) ───────────────────────────────────
  try {
    const result = await fallback.extract(resolvedUrl, 'tiktok');
    result.extractorUsed = 'fallback';
    return result;
  } catch (err) {
    throw new Error(`TikTok extraction failed: ${err.message}`);
  }
}

module.exports = { extract };
