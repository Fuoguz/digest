// Local QA only; never included in the production build. No real credentials.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { outputFor } from './reading-output.mjs';
const server = http.createServer(async (request, response) => {
  console.log(request.method, request.url, 'origin:', request.headers.origin || '(none)');
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5184');
  response.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'GET') {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname.startsWith('/app') ? '/app/index.html' : pathname;
    const file = path.resolve('.', '.' + relative);
    if (!file.startsWith(path.resolve('.') + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      const content = await fs.readFile(file);
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
    return;
  }
  if (request.method === 'OPTIONS') { response.end(); return; }
  if (request.url.startsWith('/failed')) { response.writeHead(503); response.end(); return; }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const prompt = JSON.parse(input.messages.find((message) => message.role === 'user').content);
    const snapshot = { ...prompt.document, readingMode: prompt.readingMode };
    const output = outputFor(snapshot, { invalid: request.url.startsWith('/partial'), long: request.url.startsWith('/long') });
    if (request.url.startsWith('/slow')) await new Promise((resolve) => setTimeout(resolve, 12000));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  } catch { response.writeHead(400); response.end(); }
});
server.listen(5184, '127.0.0.1', () => console.log('Mock AI QA site and endpoint http://127.0.0.1:5184/success/v1'));
