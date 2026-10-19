/**
 * Local CORS proxy for development — forwards requests to Metron API
 * with proper CORS headers so all platforms can fetch without issues.
 *
 * SECURITY: This proxy injects Metron API credentials server-side.
 * The client app NEVER sees or transmits the raw credentials.
 * Credentials are read from the project's .env file.
 *
 * Usage: node scripts/cors-proxy.js
 * Then the app hits http://<host>:3001/api/... instead of metron.cloud
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const TARGET = 'metron.cloud';

// ── Read credentials from .env ───────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
let METRON_USER = '';
let METRON_PASS = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match) {
            const [, key, value] = match;
            if (key === 'METRON_USER') METRON_USER = value.trim();
            if (key === 'METRON_PASS') METRON_PASS = value.trim();
        }
    }
} catch (err) {
    console.error('[CORS Proxy] Could not read .env file:', err.message);
    console.error('Create a .env file with METRON_USER and METRON_PASS.');
    process.exit(1);
}

if (!METRON_USER || !METRON_PASS) {
    console.error('[CORS Proxy] METRON_USER and METRON_PASS must be set in .env');
    process.exit(1);
}

const METRON_AUTH = 'Basic ' + Buffer.from(`${METRON_USER}:${METRON_PASS}`).toString('base64');

// Only allow requests from localhost / 127.0.0.1 / private IPs (any port)
const ALLOWED_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const isAllowedOrigin = origin && ALLOWED_ORIGIN_REGEX.test(origin);

    // Native apps don't send an Origin header — allow them through
    const isNativeRequest = !origin;

    if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(isAllowedOrigin ? 204 : 403);
        res.end();
        return;
    }

    // Health check endpoint for client proxy discovery
    if (req.url === '/health' || req.url === '/api/health') {
        const corsOrigin = isAllowedOrigin ? origin : (isNativeRequest ? '*' : 'null');
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': corsOrigin,
        });
        res.end(JSON.stringify({ status: 'ok', server: 'comic-calendar-proxy' }));
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

    // Reject requests from unknown origins (not localhost, not native)
    if (!isAllowedOrigin && !isNativeRequest) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Origin not allowed.');
        return;
    }

    // Forward request to Metron — inject credentials server-side.
    // Use an allowlist for client headers to avoid leaking internal client metadata.
    const forwardHeaders = {};
    if (req.headers['accept']) forwardHeaders['accept'] = req.headers['accept'];
    if (req.headers['accept-encoding']) forwardHeaders['accept-encoding'] = req.headers['accept-encoding'];
    if (req.headers['user-agent']) forwardHeaders['user-agent'] = req.headers['user-agent'];

    const options = {
        hostname: TARGET,
        port: 443,
        path: req.url,
        method: req.method,
        headers: {
            ...forwardHeaders,
            host: TARGET,
            'Authorization': METRON_AUTH,
            'Content-Type': 'application/json',
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

// Listen on 0.0.0.0 so the Android emulator can reach us via the host machine's IP
server.listen(PORT, '0.0.0.0', () => {
    console.log(`CORS proxy running → http://0.0.0.0:${PORT}/api/...`);
    console.log(`Forwarding to https://metron.cloud (credentials injected server-side)`);
    console.log(`Credentials: NEVER sent to client, NEVER in the APK bundle.`);
});
