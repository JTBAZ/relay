import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const routes = new Map([
  ['/selection-plan', 'modal-selection-plan.html'],
  ['/select-confirm', 'modal-select-confirm.html'],
  ['/action-ledger', 'modal-action-ledger.html'],
]);
createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const name = routes.get(new URL(request.url, 'http://127.0.0.1:55460').pathname);
  if (!name) { response.writeHead(404).end(); return; }
  try {
    const html = await readFile(new URL(`./mocks/decision/${name}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'self'" });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch { response.writeHead(503).end('This sketch is being updated. Reload to retry.'); }
}).listen(55460, '127.0.0.1', () => console.log('Modal sketches: http://127.0.0.1:55460/selection-plan'));
