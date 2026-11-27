// Local preview of the cockpit with sample data:  node dev/serve.mjs  → http://localhost:5190
// Serves ../public as-is, except index.html loads mock.js instead of config.js, session.js and Supabase.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'public');
const port = Number(process.env.PORT || 5190);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/placeholder') {
      const app = (new URL(req.url, 'http://x').searchParams.get('app') || 'This app').replace(/[<>&"]/g, '');
      res.writeHead(200, { 'Content-Type': types['.html'] });
      return res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;font:16px system-ui;color:#53625F;background:#FFFDF9;text-align:center"><div><b style="font-size:20px;color:#10292C">${app} shows here on the live cockpit</b><p>This local preview uses sample data, so the real app can't load inside it.</p></div>`);
    }
    if (path === '/mock.js') { res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }); return res.end(await readFile(join(here, 'mock.js'))); }
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    let body = await readFile(file);
    if (file.endsWith('index.html')) {
      body = body.toString()
        .replace('<script src="config.js"></script>', '<script src="/mock.js"></script>')
        .replace('<script src="session.js"></script>', '')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, '');
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, () => console.log(`Cockpit preview with sample data: http://localhost:${port}`));
