/**
 * Platform Detector Utility
 * ─────────────────────────
 * Identifies the social media platform from a given URL,
 * validates URL format, and normalises it before extraction.
 */

'use strict';

// ── Platform definitions ──────────────────────────────────────────────────────

const PLATFORM_PATTERNS = [
  {
    id: 'youtube',
    label: 'YouTube',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=[\w-]+/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@[\w.-]+\/.*$/i,
      /(?:https?:\/\/)?youtu\.be\/[\w-]+/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/[\w-]+/i,
      /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?.*v=[\w-]+/i,
    ],
    normalise: (url) => {
      // Convert youtu.be short links to full youtube.com links
      const shortMatch = url.match(/youtu\.be\/([\w-]+)/);
      if (shortMatch) {
        return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
      }
      return url.replace(/^http:\/\//, 'https://').replace('m.youtube.com', 'www.youtube.com');
    },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/[\w-]+\/?/i,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/[\w-]+\/?/i,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reels\/[\w-]+\/?/i,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/tv\/[\w-]+\/?/i,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[\w.]+\/\d+\/?/i,
      /(?:https?:\/\/)?instagr\.am\/p\/[\w-]+\/?/i,
    ],
    normalise: (url) => {
      url = url.replace(/^http:\/\//, 'https://');
      url = url.replace('instagr.am', 'www.instagram.com');
      // Strip query params that can break extraction
      return url.split('?')[0].replace(/\/?$/, '/');
    },
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/i,
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/[\w]+\/?/i,
      /(?:https?:\/\/)?vm\.tiktok\.com\/[\w]+\/?/i,
      /(?:https?:\/\/)?vt\.tiktok\.com\/[\w]+\/?/i,
      /(?:https?:\/\/)?(?:m\.)?tiktok\.com\/@[\w.]+\/video\/\d+/i,
    ],
    normalise: (url) => url.replace(/^http:\/\//, 'https://'),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/.*\/videos\/\d+/i,
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/video\.php\?v=\d+/i,
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/watch\/?\?.*v=\d+/i,
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/reel\/\d+/i,
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/share\/r\/[\w]+\/?/i,
      /(?:https?:\/\/)?(?:www\.)?facebook\.com\/share\/v\/[\w]+\/?/i,
      /(?:https?:\/\/)?fb\.watch\/[\w-]+\/?/i,
      /(?:https?:\/\/)?(?:m\.)?facebook\.com\/.*\/videos\/\d+/i,
    ],
    normalise: (url) => {
      url = url.replace(/^http:\/\//, 'https://');
      url = url.replace('m.facebook.com', 'www.facebook.com');
      return url;
    },
  },
];

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Detects the platform from a URL string.
 * @param {string} rawUrl
 * @returns {{ id: string, label: string, url: string } | null}
 */
function detectPlatform(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  // Ensure the URL has a protocol so RegExp anchors work correctly
  const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

  for (const platform of PLATFORM_PATTERNS) {
    for (const pattern of platform.patterns) {
      if (pattern.test(url)) {
        return {
          id: platform.id,
          label: platform.label,
          url: platform.normalise ? platform.normalise(url) : url,
        };
      }
    }
  }

  return null;
}

/**
 * Basic URL format validation.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Returns all supported platform labels.
 * @returns {string[]}
 */
function getSupportedPlatforms() {
  return PLATFORM_PATTERNS.map((p) => p.label);
}

module.exports = { detectPlatform, isValidUrl, getSupportedPlatforms };
