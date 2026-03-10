/**
 * Quick local test runner
 * Run: node test.js
 */

'use strict';

const http = require('http');

const BASE = 'http://localhost:3000';

const tests = [
  { name: 'Root info',        path: '/' },
  { name: 'Health check',     path: '/health' },
  { name: 'Platforms list',   path: '/platforms' },
  { name: 'Missing URL',      path: '/download' },
  { name: 'Invalid URL',      path: '/download?url=not-a-url' },
  { name: 'Unsupported site', path: '/download?url=https://example.com/video' },
  { name: 'YouTube video',    path: '/download?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { name: 'YouTube Short',    path: '/download?url=https://youtube.com/shorts/dQw4w9WgXcQ' },
  { name: 'youtu.be short',   path: '/download?url=https://youtu.be/dQw4w9WgXcQ' },
  { name: '404 route',        path: '/nonexistent' },
];

async function request(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('\n🧪 Social Downloader API — Test Suite\n');
  let passed = 0, failed = 0;

  for (const t of tests) {
    try {
      const { status, body } = await request(t.path);
      const ok = status < 500;
      const icon = ok ? '✅' : '❌';
      const statusField = body?.status || '—';
      console.log(`${icon} [${status}] ${t.name.padEnd(22)} → status: ${statusField}`);
      if (ok) passed++; else failed++;
    } catch (e) {
      console.log(`❌       ${t.name.padEnd(22)} → ERROR: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  Passed: ${passed}/${tests.length}   Failed: ${failed}/${tests.length}\n`);
}

run().catch(console.error);
