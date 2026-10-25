import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const pages = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/open-sheet', ['open-sheet.html', 'text/html; charset=utf-8']],
  ['/open-sheet.html', ['open-sheet.html', 'text/html; charset=utf-8']],
  ['/release-sequence', ['release-sequence.html', 'text/html; charset=utf-8']],
  ['/release-sequence.html', ['release-sequence.html', 'text/html; charset=utf-8']],
  ['/split-plan', ['split-plan.html', 'text/html; charset=utf-8']],
  ['/split-plan.html', ['split-plan.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/mockups.js', ['mockups.js', 'text/javascript; charset=utf-8']],
]);

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const entry = pages.get(new URL(request.url, 'http://127.0.0.1:55461').pathname);
  if (!entry) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(new URL(`./mocks/rhythms-layouts/${entry[0]}`, import.meta.url));
    response.writeHead(200, {
      'Content-Type': entry[1],
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(503).end('This mockup is being prepared. Reload to retry.');
  }
}).listen(55461, '127.0.0.1', () => console.log('Rhythms layout mockups: http://127.0.0.1:55461/'));
