/**
 * Local CORS proxy for development — forwards requests to Metron API
 * with proper CORS headers so the web version can fetch without browser blocks.
 *
 * Usage: node scripts/cors-proxy.js
 * Then the web app hits http://localhost:3001/api/... instead of metron.cloud
 */
const http = require('http');
const https = require('https');

const PORT = 3001;
const TARGET = 'metron.cloud';

// Only allow requests from localhost / 127.0.0.1 (any port)
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const isAllowedOrigin = origin && LOCALHOST_ORIGIN_REGEX.test(origin);

    if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(isAllowedOrigin ? 204 : 403);
        res.end();
        return;
    }

    // Only allow /api/ paths
    if (!req.url || !req.url.startsWith('/api/')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Only /api/ requests are permitted.');
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed: Metron client only requires GET requests.');
        return;
    }

    // Forward request to Metron
    const options = {
        hostname: TARGET,
        port: 443,
        path: req.url,
        method: req.method,
        headers: {
            ...req.headers,
            host: TARGET,
        },
    };

    const proxy = https.request(options, (proxyRes) => {
        const responseHeaders = { ...proxyRes.headers };
        if (isAllowedOrigin) {
            responseHeaders['Access-Control-Allow-Origin'] = origin;
        }
        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res);
    });

    proxy.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.writeHead(502);
        res.end('Proxy error');
    });

    req.pipe(proxy);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`\n[CORS Proxy] Port ${PORT} is already in use.`);
        console.log(`A proxy instance is already running and ready. No action needed.\n`);
        process.exit(0);
    } else {
        console.error('[CORS Proxy] Server error:', err);
    }
});

server.listen(PORT, () => {
    console.log(`CORS proxy running → http://localhost:${PORT}/api/...`);
    console.log('Forwarding to https://metron.cloud');
});
