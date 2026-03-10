/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║        Universal Social Media Downloader API  — v1.0.0           ║
 * ║   Platforms: YouTube · Instagram · TikTok · Facebook             ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * Quickstart:
 *   cp .env.example .env      # edit to your preferences
 *   npm install
 *   node server.js
 *
 * Endpoints:
 *   GET /                     — API info
 *   GET /health               — Health & cache stats
 *   GET /download?url=URL     — Extract media
 *   GET /platforms            — List supported platforms
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const { globalLimiter }       = require('./utils/rateLimiter');
const { getSupportedPlatforms } = require('./utils/platformDetector');
const cache                   = require('./utils/cache');
const downloadRouter          = require('./routes/download');

// ── App setup ─────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;
const ENV  = process.env.NODE_ENV || 'development';

// ── Security middleware ───────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false, // API — no HTML served
}));

// CORS — allow origins from env or all
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
}));

// ── Request logging ───────────────────────────────────────────────────────────

if (ENV !== 'test') {
  app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));
}

// ── Body parser (not needed for GET-only API, but good practice) ──────────────
app.use(express.json({ limit: '1kb' }));

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /
 * Returns API information and example usage.
 */
app.get('/', (req, res) => {
  res.json({
    name:        'Universal Social Media Downloader API',
    version:     '1.0.0',
    description: 'Extract downloadable media from Instagram, TikTok, Facebook and YouTube.',
    author:      'Your Name',
    baseUrl:     `${req.protocol}://${req.get('host')}`,
    endpoints: {
      download:  '/download?url=MEDIA_URL',
      health:    '/health',
      platforms: '/platforms',
    },
    examples: [
      '/download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '/download?url=https://www.tiktok.com/@username/video/1234567890',
      '/download?url=https://www.instagram.com/reel/ABC123/',
      '/download?url=https://www.facebook.com/watch?v=1234567890',
    ],
    authentication:
      process.env.REQUIRE_API_KEY === 'true'
        ? 'Required — pass key via ?key=, X-API-Key header, or Bearer token'
        : 'Not required',
    rateLimit: {
      global:   '100 requests / 15 min per IP',
      download: '20 requests / 15 min per IP',
    },
    docs: 'https://github.com/your-username/social-downloader-api',
  });
});

/**
 * GET /health
 * Returns server health status and cache statistics.
 */
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    uptime:    Math.round(process.uptime()) + 's',
    memory:    {
      heapUsedMb:  (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(1),
      heapTotalMb: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1),
    },
    cache:     cache.getStats(),
    env:       ENV,
    node:      process.version,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /platforms
 * Returns list of supported platforms.
 */
app.get('/platforms', (req, res) => {
  res.json({
    status:    'success',
    platforms: getSupportedPlatforms(),
    count:     getSupportedPlatforms().length,
  });
});

/**
 * GET /download  — core extraction endpoint
 */
app.use('/download', downloadRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    status:  'error',
    code:    'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found.`,
    hint:    'Use GET /download?url=MEDIA_URL to extract media.',
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({
    status:  'error',
    code:    'INTERNAL_ERROR',
    message: ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ── Start server ──────────────────────────────────────────────────────────────

// In serverless environments (Vercel) the server is not started directly;
// the app is exported as a module instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  Universal Social Media Downloader API       ║');
    console.log(`║  Running on http://localhost:${PORT}           ║`);
    console.log(`║  Environment: ${ENV.padEnd(29)} ║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  /download?url=MEDIA_URL  →  Extract media');
    console.log('  /health                  →  Health check');
    console.log('  /platforms               →  Supported platforms');
    console.log('');
    console.log(`  Auth required: ${process.env.REQUIRE_API_KEY === 'true' ? 'YES' : 'NO'}`);
    console.log('');
  });
}

// Export for Vercel / testing
module.exports = app;
