import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const sketch = new URL('./mocks/decision/open-studio-refined.html', import.meta.url);
createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = new URL(request.url, 'http://127.0.0.1:55459').pathname;
  if (!['/', '/sketch/0'].includes(path)) { response.writeHead(404).end(); return; }
  try {
    const html = await readFile(sketch);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch { response.writeHead(503).end('The sketch is being updated. Reload to retry.'); }
}).listen(55459, '127.0.0.1', () => console.log('Studio sketch: http://127.0.0.1:55459/sketch/0?raw=1'));
