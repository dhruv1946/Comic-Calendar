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

const server = http.createServer((req, res) => {
    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
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
        res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
    });

    proxy.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.writeHead(502);
        res.end('Proxy error');
    });

    req.pipe(proxy);
});

server.listen(PORT, () => {
    console.log(`CORS proxy running → http://localhost:${PORT}/api/...`);
    console.log('Forwarding to https://metron.cloud');
});
