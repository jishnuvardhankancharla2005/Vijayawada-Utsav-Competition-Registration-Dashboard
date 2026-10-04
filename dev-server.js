/**
 * Development & Local Production HTTP Server
 * Serves static assets and provides local /api/data, /api/auth, and /api/status endpoints.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const dataHandler = require('./api/data');
const authHandler = require('./api/auth');
const statusHandler = require('./api/status');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Augment req with query and helper res.status/json/setHeader
  req.query = parsedUrl.query;

  res.status = function(code) {
    this.statusCode = code;
    return this;
  };

  res.json = function(data) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(data));
  };

  // Handle API routes
  if (pathname === '/api/data') {
    return dataHandler(req, res);
  }

  if (pathname === '/api/auth' || pathname === '/api/status') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch {
        req.body = body;
      }
      if (pathname === '/api/auth') return authHandler(req, res);
      if (pathname === '/api/status') return statusHandler(req, res);
    });
    return;
  }

  // Handle static file serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Vijayawada Utsav Server running at http://localhost:${PORT}`);
});
