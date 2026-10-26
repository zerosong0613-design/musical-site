// 로컬 미리보기용 정적 서버.
//   node scripts/serve.mjs                → 저장소 그대로 (http://localhost:5173)
//   node scripts/build-site.mjs && SERVE_DIR=dist node scripts/serve.mjs → 배포본과 같은 주소 규칙으로 확인
// /show/PF… 처럼 확장자 없는 주소는 같은 이름의 .html, 없으면 index.html(앱이 화면을 그림)로 응답한다. Vercel의 cleanUrls와 같은 동작.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize, resolve, sep } from 'node:path';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const ROOT = resolve(REPO, process.env.SERVE_DIR ?? '.') + sep;
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(ROOT) || file.split(sep).some(p => p.startsWith('.env'))) return res.writeHead(403).end();
  const candidates = extname(file) ? [[file, 200]] : [[file + '.html', 200], [join(ROOT, '404.html'), 404], [join(ROOT, 'index.html'), 200]];
  for (const [candidate, status] of candidates) {
    try {
      const body = await readFile(candidate);
      return res.writeHead(status, { 'content-type': (TYPES[extname(candidate)] ?? 'application/octet-stream') + '; charset=utf-8', 'cache-control': 'no-store' }).end(body);
    } catch {}
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`http://localhost:${PORT} (${ROOT})`));
