# 📥 Universal Social Media Downloader API

A **production-level** REST API built with **Node.js, Express.js, and yt-dlp** that extracts downloadable media from Instagram, TikTok, Facebook, and YouTube.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Auto Platform Detection** | Detects YouTube, Instagram, TikTok, Facebook automatically |
| **Multi-Extractor Chain** | yt-dlp → ytdl-core → fallback APIs — first success wins |
| **All Media Types** | Videos, Reels, Shorts, Carousels, Stories, Images |
| **HD Quality Selection** | Returns all available qualities sorted best-first |
| **Caching** | In-memory TTL cache prevents redundant extractions |
| **Rate Limiting** | Per-IP limits protect against abuse |
| **API Key Auth** | Optional key-based authentication |
| **Retry Logic** | Automatic retry on transient failures |
| **Vercel Ready** | Serverless-compatible out of the box |

---

## 🗂️ Project Structure

```
social-downloader-api/
├── server.js                  ← Express app entry point
├── vercel.json                ← Vercel deployment config
├── package.json
├── .env.example               ← Copy to .env and fill in
├── test.js                    ← Quick local test runner
│
├── routes/
│   └── download.js            ← GET /download handler
│
├── services/
│   ├── youtubeService.js      ← YouTube orchestration
│   ├── tiktokService.js       ← TikTok orchestration
│   ├── instagramService.js    ← Instagram orchestration
│   └── facebookService.js     ← Facebook orchestration
│
├── extractors/
│   ├── ytdlpExtractor.js      ← Primary extractor (yt-dlp binary)
│   └── fallbackExtractor.js   ← Fallback (ytdl-core, APIs, scraping)
│
├── utils/
│   ├── platformDetector.js    ← URL → platform detection
│   ├── cache.js               ← node-cache wrapper
│   └── rateLimiter.js         ← express-rate-limit presets
│
└── middleware/
    └── auth.js                ← Optional API key gate
```

---

## 🚀 Quick Start (Local)

### Step 1 — Install Node.js

Download and install **Node.js 18+** from https://nodejs.org

Verify:
```bash
node --version   # v18.x.x or higher
npm --version
```

### Step 2 — Install yt-dlp

yt-dlp is the primary extractor binary. Install once on your system:

```bash
# macOS (Homebrew)
brew install yt-dlp

# Linux (pip)
pip install yt-dlp

# Linux (apt, Debian/Ubuntu)
sudo apt install yt-dlp

# Windows (winget)
winget install yt-dlp

# Verify
yt-dlp --version
```

> **Note:** yt-dlp is optional locally (the JS fallback extractors kick in when it's absent), but it greatly improves extraction quality and success rate.

### Step 3 — Clone / Create Project Folder

```bash
mkdir social-downloader-api
cd social-downloader-api
# Paste all the project files here
```

### Step 4 — Install Dependencies

```bash
npm install
```

### Step 5 — Configure Environment

```bash
cp .env.example .env
# Edit .env with your preferred settings
```

Key settings in `.env`:

```env
PORT=3000
NODE_ENV=development
REQUIRE_API_KEY=false          # Set true to enable auth
API_KEYS=your-secret-key-here  # Comma-separated keys
CACHE_TTL_SECONDS=300          # Cache duration
INSTAGRAM_SESSION_ID=          # Optional: for private IG content
TIKTOK_SESSION_ID=             # Optional: for private TikTok content
```

### Step 6 — Start the Server

```bash
node server.js
# or, for auto-reload during development:
npm run dev
```

Server starts at: **http://localhost:3000**

### Step 7 — Test Locally

```bash
# Run the included test suite
node test.js

# Or test directly with curl:
curl "http://localhost:3000/download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Health check
curl http://localhost:3000/health
```

---

## 📡 API Endpoints

### `GET /`
Returns API info and usage examples.

### `GET /health`
Returns server health, uptime, memory, and cache stats.

### `GET /platforms`
Returns list of supported platforms.

### `GET /download?url=MEDIA_URL`
**Main extraction endpoint.**

**Parameters:**

| Param | Required | Description |
|---|---|---|
| `url` | ✅ Yes | The full media URL to extract |
| `key` | ⚠️ When auth enabled | API key |

**Example requests:**

```
# YouTube video
GET /download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ

# YouTube Short
GET /download?url=https://youtube.com/shorts/abc123

# youtu.be short link
GET /download?url=https://youtu.be/dQw4w9WgXcQ

# Instagram Reel
GET /download?url=https://www.instagram.com/reel/ABC123/

# Instagram Carousel post
GET /download?url=https://www.instagram.com/p/XYZ789/

# TikTok video
GET /download?url=https://www.tiktok.com/@user/video/1234567890

# TikTok short link
GET /download?url=https://vm.tiktok.com/XXXXXX/

# Facebook video
GET /download?url=https://www.facebook.com/watch?v=1234567890

# Facebook Reel
GET /download?url=https://www.facebook.com/reel/1234567890

# With API key (when auth is enabled)
GET /download?url=URL&key=your-secret-key
```

---

## 📦 Response Format

### Single media (video / image)

```json
{
  "status": "success",
  "platform": "youtube",
  "type": "video",
  "title": "Never Gonna Give You Up",
  "description": "The official video...",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "duration": 212,
  "uploader": "Rick Astley",
  "uploadDate": "20091025",
  "viewCount": 1400000000,
  "likeCount": 15000000,
  "extractorUsed": "yt-dlp",
  "downloads": [
    {
      "quality": "1080p",
      "url": "https://...",
      "ext": "mp4",
      "filesize": 123456789,
      "fps": 30,
      "vcodec": "avc1",
      "acodec": "mp4a"
    },
    {
      "quality": "720p",
      "url": "https://...",
      "ext": "mp4"
    },
    {
      "quality": "audio only",
      "url": "https://...",
      "ext": "mp4"
    }
  ],
  "_meta": {
    "cached": false,
    "platform": "youtube",
    "processingMs": 1842
  }
}
```

### Carousel / multiple media

```json
{
  "status": "success",
  "platform": "instagram",
  "type": "carousel",
  "title": "My Instagram Post",
  "thumbnail": "https://...",
  "count": 3,
  "items": [
    {
      "status": "success",
      "platform": "instagram",
      "type": "image",
      "title": "Slide 1",
      "downloads": [{ "quality": "original", "url": "https://...", "ext": "jpg" }]
    }
  ]
}
```

### Error response

```json
{
  "status": "error",
  "code": "UNSUPPORTED_PLATFORM",
  "message": "Platform not supported. Supported platforms: YouTube, Instagram, TikTok, Facebook.",
  "details": { "providedUrl": "https://example.com/video" }
}
```

**Error codes:**

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_URL` | 400 | No URL query param |
| `INVALID_URL` | 400 | Malformed URL |
| `UNSUPPORTED_PLATFORM` | 400 | URL doesn't match any platform |
| `PRIVATE_CONTENT` | 403 | Content requires authentication |
| `CONTENT_NOT_FOUND` | 404 | Media deleted / unavailable |
| `MISSING_API_KEY` | 401 | Auth enabled but no key provided |
| `INVALID_API_KEY` | 403 | Key provided but not valid |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `EXTRACTION_TIMEOUT` | 504 | Extraction took too long |
| `EXTRACTION_FAILED` | 500 | All extractors failed |

---

## 🔒 Authentication

Authentication is **disabled by default**. To enable:

```env
# .env
REQUIRE_API_KEY=true
API_KEYS=key1-here,key2-here
```

Pass the key in any of these ways:

```bash
# Query param
GET /download?url=URL&key=YOUR_KEY

# HTTP header
X-API-Key: YOUR_KEY

# Bearer token
Authorization: Bearer YOUR_KEY
```

Generate a secure key:
```bash
openssl rand -hex 32
```

---

## 🔁 Rate Limits

| Scope | Limit | Window |
|---|---|---|
| All routes (global) | 100 requests | 15 minutes |
| `/download` only | 20 requests | 15 minutes |

Limits are per IP address (or per API key when auth is enabled).
Headers `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` are returned on every response.

---

## 🍪 Private Content (Session Cookies)

For private Instagram / TikTok content, supply your session cookie:

```env
# .env
INSTAGRAM_SESSION_ID=your_sessionid_cookie_value
TIKTOK_SESSION_ID=your_sessionid_cookie_value
```

**How to get your session ID:**
1. Log in on a desktop browser
2. Open DevTools → Application → Cookies
3. Find the `sessionid` cookie value
4. Paste it into `.env`

> ⚠️ Never commit `.env` to Git. Session IDs are sensitive credentials.

---

## ☁️ Vercel Deployment Guide

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/social-downloader-api.git
git push -u origin main
```

### Step 2 — Create Vercel Account

Go to https://vercel.com and sign up (free).

### Step 3 — Import Repository

1. Click **"Add New Project"**
2. Connect your GitHub account
3. Select your `social-downloader-api` repository
4. Click **"Import"**

### Step 4 — Configure Project Settings

In the Vercel project settings:

- **Framework Preset:** `Other`
- **Root Directory:** `./`
- **Build Command:** *(leave empty)*
- **Output Directory:** *(leave empty)*
- **Install Command:** `npm install`

### Step 5 — Add Environment Variables

In Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `REQUIRE_API_KEY` | `true` (recommended) |
| `API_KEYS` | `your-secret-key` |
| `CACHE_TTL_SECONDS` | `300` |
| `RATE_LIMIT_MAX_REQUESTS` | `50` |

### Step 6 — Deploy

Click **"Deploy"**. Vercel builds and deploys automatically.

### Step 7 — Get Your Public URL

After deployment, your API is live at:
```
https://your-project-name.vercel.app
```

**Test it:**
```bash
curl "https://your-project-name.vercel.app/download?url=https://youtu.be/dQw4w9WgXcQ"
```

### ⚠️ Vercel Limitations

| Limitation | Impact |
|---|---|
| **No yt-dlp binary** | Serverless containers don't have it — JS fallback extractors are used |
| **30s function timeout** | Long extractions may time out; set `EXTRACTION_TIMEOUT_MS=25000` |
| **No persistent cache** | Cache resets between function invocations (stateless) |
| **Cold starts** | First request after idle period may be slower |

**Recommended for production:** Deploy on a VPS (Railway, Render, DigitalOcean) where you can install yt-dlp for best results.

---

## 🖥️ VPS Deployment (Best Performance)

For platforms like Railway, Render, or DigitalOcean where you can install yt-dlp:

**Dockerfile (optional):**
```dockerfile
FROM node:18-alpine
RUN pip3 install yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Or use a post-install script in `package.json`:
```json
{
  "scripts": {
    "postinstall": "pip3 install yt-dlp || echo 'yt-dlp not installed, using fallback'"
  }
}
```

---

## 🧩 Extraction Architecture

```
Request
   │
   ▼
platformDetector.js   ← detects platform from URL
   │
   ▼
[Platform Service]    ← youtubeService / tiktokService / etc.
   │
   ├── Attempt 1: ytdlpExtractor    (spawns yt-dlp binary)
   │       │
   │       └── FAIL → Attempt 2: fallbackExtractor
   │                       ├── YouTube:   ytdl-core (pure JS)
   │                       ├── TikTok:    tikwm.com API
   │                       ├── Instagram: Open Graph scrape
   │                       └── Facebook:  oEmbed + OG scrape
   │
   ▼
cache.js              ← store result for CACHE_TTL_SECONDS
   │
   ▼
Structured JSON Response
```

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start with hot-reload
npm run dev

# Run tests
node test.js

# Check a specific URL
curl "http://localhost:3000/download?url=YOUR_URL" | jq
```

---

## 📝 License

MIT — use freely, modify and deploy as needed.
