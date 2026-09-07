import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5180;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

function resolveRequestPath(requestURL) {
  const urlPath = decodeURIComponent(new URL(requestURL, 'http://localhost').pathname);
  const routePath = urlPath === '/' ? '/index.html'
    : (urlPath === '/app' || urlPath === '/app/' || urlPath.startsWith('/app/')) && !path.extname(urlPath)
      ? '/app/index.html'
      : urlPath;
  const resolved = path.resolve(ROOT, '.' + routePath);
  return resolved.startsWith(ROOT) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('403 Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('404 Not Found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    response.end(data);
  });
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? '端口 ' + PORT + ' 已被占用。' : error.message);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT + '/';
  console.log('Digest v0.2 is running at ' + url);
});
