/**
 * Fallback Extractor
 * ──────────────────
 * Used when yt-dlp is unavailable (e.g. Vercel serverless) or when
 * yt-dlp fails for a specific URL.
 *
 * Strategy per platform:
 *  • YouTube  → ytdl-core (pure JS, no binary needed)
 *  • TikTok   → public oEmbed + tikwm.com API
 *  • Instagram → public oEmbed endpoint + web scraping
 *  • Facebook  → public oEmbed API
 *
 * These APIs are best-effort; some content types or private posts
 * will not be accessible without valid session cookies.
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = parseInt(process.env.EXTRACTION_TIMEOUT_MS || '30000', 10);

const http = axios.create({
  timeout: TIMEOUT,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

// ── YouTube fallback via ytdl-core ────────────────────────────────────────────

async function extractYouTube(url) {
  let ytdl;
  try {
    ytdl = require('ytdl-core');
  } catch {
    throw new Error('ytdl-core is not installed. Run: npm install ytdl-core');
  }

  const info    = await ytdl.getInfo(url);
  const details = info.videoDetails;

  // Pick a good set of formats
  const allFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
  const videoOnly  = ytdl.filterFormats(info.formats, 'videoonly').slice(0, 3);
  const audioOnly  = ytdl.filterFormats(info.formats, 'audioonly').slice(0, 1);

  const downloads = [
    ...allFormats.map((f) => ({
      quality:   f.qualityLabel || f.quality || 'unknown',
      url:       f.url,
      ext:       f.container   || 'mp4',
      filesize:  f.contentLength ? parseInt(f.contentLength) : null,
      fps:       f.fps          || null,
      bitrate:   f.bitrate      || null,
    })),
    ...videoOnly.map((f) => ({
      quality:  (f.qualityLabel || f.quality || 'unknown') + ' (video only)',
      url:       f.url,
      ext:       f.container || 'mp4',
      filesize:  f.contentLength ? parseInt(f.contentLength) : null,
    })),
    ...audioOnly.map((f) => ({
      quality:  'audio only',
      url:       f.url,
      ext:       f.container || 'mp4',
      filesize:  f.contentLength ? parseInt(f.contentLength) : null,
    })),
  ];

  return {
    status:      'success',
    platform:    'youtube',
    type:        'video',
    title:       details.title,
    description: details.description,
    thumbnail:   details.thumbnails?.slice(-1)[0]?.url || null,
    duration:    parseInt(details.lengthSeconds, 10) || null,
    uploader:    details.author?.name || null,
    uploadDate:  details.publishDate  || null,
    viewCount:   parseInt(details.viewCount, 10) || null,
    likeCount:   null,
    downloads,
  };
}

// ── TikTok fallback ───────────────────────────────────────────────────────────

async function extractTikTok(url) {
  // Method 1: tikwm.com public API
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const { data } = await http.get(apiUrl);

    if (data?.code === 0 && data?.data) {
      const d = data.data;
      const downloads = [];

      if (d.play)    downloads.push({ quality: 'HD (no watermark)', url: d.play,    ext: 'mp4' });
      if (d.wmplay)  downloads.push({ quality: 'SD (watermark)',     url: d.wmplay,  ext: 'mp4' });
      if (d.music)   downloads.push({ quality: 'audio only',         url: d.music,   ext: 'mp3' });

      // Carousel (image post)
      if (d.images && d.images.length > 0) {
        return {
          status:    'success',
          platform:  'tiktok',
          type:      'carousel',
          title:     d.title || 'TikTok Post',
          thumbnail: d.cover  || null,
          count:     d.images.length,
          items:     d.images.map((imgUrl, i) => ({
            status:    'success',
            platform:  'tiktok',
            type:      'image',
            title:     `${d.title || 'TikTok'} — image ${i + 1}`,
            thumbnail: imgUrl,
            downloads: [{ quality: 'original', url: imgUrl, ext: 'jpg' }],
          })),
        };
      }

      return {
        status:     'success',
        platform:   'tiktok',
        type:       'video',
        title:      d.title     || 'TikTok Video',
        thumbnail:  d.cover     || null,
        duration:   d.duration  || null,
        uploader:   d.author?.nickname || null,
        viewCount:  d.play_count || null,
        likeCount:  d.digg_count || null,
        downloads,
      };
    }
  } catch (e) {
    console.warn('[fallback:tiktok] tikwm API failed:', e.message);
  }

  // Method 2: oEmbed (metadata only, no direct video URL)
  const oembed = await http.get(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  );
  return {
    status:     'success',
    platform:   'tiktok',
    type:       'video',
    title:      oembed.data?.title      || 'TikTok Video',
    thumbnail:  oembed.data?.thumbnail_url || null,
    uploader:   oembed.data?.author_name  || null,
    downloads:  [],   // no direct URL from oEmbed
    warning:    'Direct download URL unavailable; yt-dlp recommended for full extraction.',
  };
}

// ── Instagram fallback ────────────────────────────────────────────────────────

async function extractInstagram(url) {
  // Method 1: Instagram oEmbed (public, no auth needed for public posts)
  try {
    const oembedUrl = `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=anonymous`;
    const { data } = await http.get(oembedUrl);

    return {
      status:     'success',
      platform:   'instagram',
      type:       'post',
      title:      data.title         || 'Instagram Post',
      thumbnail:  data.thumbnail_url || null,
      uploader:   data.author_name   || null,
      downloads:  [],
      warning:    'Instagram restricts direct URL extraction. yt-dlp with session cookie recommended.',
      embedHtml:  data.html || null,
    };
  } catch {
    // oEmbed failed — scrape publicly available thumbnail
  }

  // Method 2: Scrape open graph tags from public post
  try {
    const { data: html } = await http.get(url, {
      headers: {
        Cookie: process.env.INSTAGRAM_SESSION_ID
          ? `sessionid=${process.env.INSTAGRAM_SESSION_ID}`
          : '',
      },
    });

    const $ = cheerio.load(html);
    const ogTitle  = $('meta[property="og:title"]').attr('content')  || 'Instagram Post';
    const ogImage  = $('meta[property="og:image"]').attr('content')  || null;
    const ogVideo  = $('meta[property="og:video"]').attr('content')  || null;
    const ogType   = $('meta[property="og:type"]').attr('content')   || 'video';

    const downloads = [];
    if (ogVideo) downloads.push({ quality: 'SD', url: ogVideo, ext: 'mp4' });
    if (ogImage) downloads.push({ quality: 'thumbnail', url: ogImage, ext: 'jpg' });

    return {
      status:     'success',
      platform:   'instagram',
      type:       ogVideo ? 'video' : 'image',
      title:      ogTitle,
      thumbnail:  ogImage,
      downloads,
    };
  } catch (e) {
    throw new Error(`Instagram extraction failed: ${e.message}. Private content requires session cookie.`);
  }
}

// ── Facebook fallback ─────────────────────────────────────────────────────────

async function extractFacebook(url) {
  // Method 1: oEmbed
  try {
    const { data } = await http.get(
      `https://graph.facebook.com/v19.0/oembed_video?url=${encodeURIComponent(url)}&access_token=anonymous`
    );

    return {
      status:     'success',
      platform:   'facebook',
      type:       'video',
      title:      data.title         || 'Facebook Video',
      thumbnail:  data.thumbnail_url || null,
      uploader:   data.author_name   || null,
      downloads:  [],
      warning:    'Facebook restricts direct URL extraction. yt-dlp with cookies recommended.',
    };
  } catch {
    // oEmbed unavailable
  }

  // Method 2: Open Graph scrape
  try {
    const { data: html } = await http.get(url);
    const $ = cheerio.load(html);

    const ogTitle  = $('meta[property="og:title"]').attr('content')  || 'Facebook Video';
    const ogImage  = $('meta[property="og:image"]').attr('content')  || null;
    const ogVideo  = $('meta[property="og:video:url"]').attr('content') ||
                     $('meta[property="og:video"]').attr('content')  || null;

    const downloads = [];
    if (ogVideo) downloads.push({ quality: 'SD', url: ogVideo, ext: 'mp4' });
    if (ogImage) downloads.push({ quality: 'thumbnail', url: ogImage, ext: 'jpg' });

    return {
      status:    'success',
      platform:  'facebook',
      type:      ogVideo ? 'video' : 'post',
      title:     ogTitle,
      thumbnail: ogImage,
      downloads,
    };
  } catch (e) {
    throw new Error(`Facebook extraction failed: ${e.message}. Private content requires cookies.`);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Dispatches extraction to the appropriate platform-specific handler.
 *
 * @param {string} url        Normalised URL
 * @param {string} platformId Platform identifier
 * @returns {Promise<object>} Standard API response payload
 */
async function extract(url, platformId) {
  switch (platformId) {
    case 'youtube':   return extractYouTube(url);
    case 'tiktok':    return extractTikTok(url);
    case 'instagram': return extractInstagram(url);
    case 'facebook':  return extractFacebook(url);
    default:
      throw new Error(`No fallback extractor available for platform: ${platformId}`);
  }
}

module.exports = { extract };
