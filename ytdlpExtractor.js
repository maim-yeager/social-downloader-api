/**
 * yt-dlp Extractor
 * ─────────────────
 * Primary extractor.  Spawns yt-dlp as a child process and parses
 * its JSON output into the API's standard response shape.
 *
 * yt-dlp must be installed on the host machine:
 *   pip install yt-dlp        (Python)
 *   brew install yt-dlp       (macOS)
 *   apt install yt-dlp        (Debian / Ubuntu)
 *   winget install yt-dlp     (Windows)
 *
 * On Vercel (serverless) yt-dlp is NOT available — the fallback
 * extractors handle that environment automatically.
 */

'use strict';

const { exec }   = require('child_process');
const { promisify } = require('util');
const execAsync  = promisify(exec);

const TIMEOUT_MS = parseInt(process.env.EXTRACTION_TIMEOUT_MS || '30000', 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks whether yt-dlp binary is available on PATH.
 * @returns {Promise<boolean>}
 */
async function isYtDlpAvailable() {
  try {
    await execAsync('yt-dlp --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Maps a yt-dlp format object to our standard download entry.
 * @param {object} fmt
 * @returns {object}
 */
function mapFormat(fmt) {
  const quality =
    fmt.height      ? `${fmt.height}p`  :
    fmt.format_note ? fmt.format_note    :
    fmt.format_id   ? fmt.format_id      : 'unknown';

  return {
    quality,
    url:       fmt.url,
    ext:       fmt.ext          || 'mp4',
    filesize:  fmt.filesize     || fmt.filesize_approx || null,
    vcodec:    fmt.vcodec       || null,
    acodec:    fmt.acodec       || null,
    fps:       fmt.fps          || null,
    tbr:       fmt.tbr          || null,
    formatId:  fmt.format_id    || null,
  };
}

/**
 * Selects the best formats to return:
 *  • For video: best combined stream + top separate video+audio streams
 *  • For audio-only: best audio stream
 *  • For images: all image entries
 *
 * @param {object[]} formats
 * @param {string}   mediaType
 * @returns {object[]}
 */
function selectFormats(formats, mediaType) {
  if (!formats || formats.length === 0) return [];

  if (mediaType === 'image') {
    return formats.map(mapFormat);
  }

  // Separate combined streams (has both video & audio)
  const combined = formats.filter(
    (f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
  );

  // Video-only streams (for DASH / HLS)
  const videoOnly = formats.filter(
    (f) => f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none')
  );

  // Audio-only streams
  const audioOnly = formats.filter(
    (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
  );

  const result = [];

  // Best combined streams (sorted by height descending)
  const sortedCombined = combined
    .filter((f) => f.url)
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .slice(0, 4); // top 4 quality tiers

  result.push(...sortedCombined.map(mapFormat));

  // Best video-only (for clients that can mux)
  const topVideo = videoOnly
    .filter((f) => f.url)
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .slice(0, 2);

  result.push(...topVideo.map(mapFormat));

  // Best audio-only
  const topAudio = audioOnly
    .filter((f) => f.url)
    .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
    .slice(0, 1);

  result.push(...topAudio.map(mapFormat));

  // De-duplicate by URL
  const seen = new Set();
  return result.filter((f) => {
    if (!f.url || seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });
}

/**
 * Determines media type from yt-dlp info dict.
 * @param {object} info
 * @returns {string}
 */
function detectMediaType(info) {
  if (info._type === 'playlist') return 'playlist';
  const ext = (info.ext || '').toLowerCase();
  const imageExts = ['jpg','jpeg','png','gif','webp','bmp'];
  if (imageExts.includes(ext)) return 'image';
  if (info.vcodec && info.vcodec !== 'none') return 'video';
  if (info.acodec && info.acodec !== 'none') return 'audio';
  return 'video'; // safe default
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Extracts media information using yt-dlp.
 *
 * @param {string} url        Normalised media URL
 * @param {string} platformId Platform identifier
 * @returns {Promise<object>} Standard API response payload
 */
async function extract(url, platformId) {
  const available = await isYtDlpAvailable();
  if (!available) {
    throw new Error('yt-dlp binary not found. Install it or rely on fallback extractors.');
  }

  // Build yt-dlp command
  // --dump-json       → print metadata as JSON, don't download
  // --no-warnings     → suppress non-fatal warnings on stderr
  // --flat-playlist   → don't recurse into playlists
  // --no-check-certificate → avoid SSL issues on some hosts
  const cookieArgs = buildCookieArgs(platformId);
  const cmd = [
    'yt-dlp',
    '--dump-json',
    '--no-warnings',
    '--no-check-certificate',
    '--flat-playlist',
    ...cookieArgs,
    `"${url}"`,
  ].join(' ');

  let stdout;
  try {
    const result = await execAsync(cmd, {
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    stdout = result.stdout;
  } catch (err) {
    const msg = err.stderr || err.message || 'yt-dlp execution failed';
    throw new Error(`yt-dlp error: ${msg.trim().split('\n')[0]}`);
  }

  // yt-dlp may output multiple JSON objects for playlists (one per line)
  const lines = stdout.trim().split('\n').filter(Boolean);
  if (lines.length === 0) throw new Error('yt-dlp returned no output');

  const infos = lines.map((line) => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);

  if (infos.length === 0) throw new Error('Failed to parse yt-dlp JSON output');

  // Single media item
  if (infos.length === 1) {
    return buildSingleResponse(infos[0], platformId);
  }

  // Multiple items (carousel / playlist)
  return buildMultiResponse(infos, platformId);
}

// ── Response builders ─────────────────────────────────────────────────────────

function buildSingleResponse(info, platformId) {
  const mediaType = detectMediaType(info);
  const downloads = selectFormats(info.formats || [], mediaType);

  // If yt-dlp provided a direct url with no formats array
  if (downloads.length === 0 && info.url) {
    downloads.push({
      quality: info.height ? `${info.height}p` : 'SD',
      url:     info.url,
      ext:     info.ext || 'mp4',
    });
  }

  return {
    status:     'success',
    platform:   platformId,
    type:       mediaType,
    title:      info.title        || info.description || 'Untitled',
    description:info.description  || null,
    thumbnail:  info.thumbnail    || (info.thumbnails?.[0]?.url) || null,
    duration:   info.duration     || null,
    uploader:   info.uploader     || info.channel || info.creator || null,
    uploadDate: info.upload_date  || null,
    viewCount:  info.view_count   || null,
    likeCount:  info.like_count   || null,
    downloads,
    raw: {
      extId:    info.id,
      webpage:  info.webpage_url  || null,
    },
  };
}

function buildMultiResponse(infos, platformId) {
  const mediaItems = infos.map((info) => buildSingleResponse(info, platformId));

  return {
    status:    'success',
    platform:  platformId,
    type:      'carousel',
    title:     infos[0]?.title || 'Multiple Media',
    thumbnail: infos[0]?.thumbnail || (infos[0]?.thumbnails?.[0]?.url) || null,
    count:     infos.length,
    items:     mediaItems,
  };
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/**
 * Builds extra yt-dlp arguments for session-based auth.
 * @param {string} platformId
 * @returns {string[]}
 */
function buildCookieArgs(platformId) {
  const args = [];

  const cookieMap = {
    instagram: process.env.INSTAGRAM_SESSION_ID,
    tiktok:    process.env.TIKTOK_SESSION_ID,
  };

  const sessionId = cookieMap[platformId];
  if (sessionId) {
    // Pass session cookie via yt-dlp's --add-header option
    const cookieName = platformId === 'instagram' ? 'sessionid' : 'sessionid';
    args.push(`--add-header "Cookie:${cookieName}=${sessionId}"`);
  }

  return args;
}

module.exports = { extract, isYtDlpAvailable };
