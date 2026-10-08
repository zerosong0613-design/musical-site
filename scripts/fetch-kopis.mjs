// KOPIS 오픈API → data/shows.json
// 목록 전체 페이지 → 상세 조회 → 어린이극·단기 행사 제외 → 대극장 여부 표시
// 실패하면 아무것도 쓰지 않고 종료한다(이전 JSON 유지).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
try { process.loadEnvFile(fileURLToPath(new URL('.env', ROOT))); } catch {}

const KEY = process.env.KOPIS_API_KEY;
if (!KEY) {
  console.error('KOPIS_API_KEY가 없습니다. musical-site/.env 파일에 KOPIS_API_KEY=... 한 줄을 넣어 주세요.');
  process.exit(1);
}

// 서비스키는 HTTPS로만 전송한다.
const BASE = 'https://kopis.or.kr/openApi/restful';
const GAP_MS = 300;

const readJSON = async (path, fallback) => {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); } catch { return fallback; }
};
const config = await readJSON('config.json');
const venues = await readJSON('data/venues.json', {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  .trim();
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map(m => m[1]);
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

let last = 0;
async function api(path, params = {}) {
  const qs = new URLSearchParams({ service: KEY, ...params });
  let error;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
      last = Date.now();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const code = tag(xml, 'returncode');
      if (code && code !== '00') throw new Error(`KOPIS 오류 ${code}: ${tag(xml, 'errmsg')}`);
      if (!/<dbs(?:\s[^>]*)?>/.test(xml)) throw new Error('정상 XML 목록이 아닙니다.');
      return xml;
    } catch (e) {
      last = Date.now();
      error = new Error(String(e.message).replaceAll(KEY, '[redacted]'));
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`${path} 호출 실패: ${error.message}`);
}

const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const iso = s => s.replaceAll('.', '-');
const DAY = 86400e3;

async function listIds() {
  const ids = new Set();
  const start = Date.now() + 9 * 3600e3; // 한국 시간 기준 오늘
  const end = start + config.monthsAhead * 30 * DAY;
  for (let from = start; from < end; from += 90 * DAY) {
    const to = Math.min(from + 89 * DAY, end);
    for (const region of (config.regions ?? [config.region])) {
    for (let cpage = 1; ; cpage++) {
      const params = { stdate: ymd(new Date(from)), eddate: ymd(new Date(to)), cpage, rows: 100, shcate: 'GGGA' };
      if (region) params.signgucode = region;
      const rows = blocks(await api('/pblprfr', params), 'db');
      rows.forEach(r => ids.add(tag(r, 'mt20id')));
      if (rows.length < 100) break;
    }
    }
  }
  ids.delete('');
  return [...ids];
}

const seatNumber = s => /^\d+$/.test(String(s).replaceAll(',', '')) ? Number(String(s).replaceAll(',', '')) : null;
async function venue(mt10id) {
  if (!mt10id) return null;
  // 기존 캐시에 홀 ID가 없으면 다시 조회한다.
  if (!venues[mt10id]?.halls?.every(h => h.id)) {
    const db = blocks(await api(`/prfplc/${mt10id}`), 'db')[0];
    if (!db) throw new Error('공연시설 상세가 비어 있습니다.');
    const halls = blocks(db, 'mt13').map(h => ({ id: tag(h, 'mt13id'), name: tag(h, 'prfplcnm'), seats: seatNumber(tag(h, 'seatscale')) }));
    const own = db.replace(/<mt13s>[\s\S]*<\/mt13s>/, '');
    venues[mt10id] = { name: tag(own, 'fcltynm'), halls };
  }
  return venues[mt10id];
}
function hallSeats(hallId, v) {
  return v?.halls.find(h => h.id === hallId)?.seats ?? null;
}

const ids = await listIds();
console.log(`목록 ${ids.length}건, 상세 조회 시작`);

const shows = [];
const skipped = { child: 0, short: 0, keyword: 0 };
for (const id of ids) {
  const db = blocks(await api(`/pblprfr/${id}`), 'db')[0];
  if (!db) continue;
  const title = tag(db, 'prfnm');
  const from = iso(tag(db, 'prfpdfrom'));
  const to = iso(tag(db, 'prfpdto'));
  const openrun = tag(db, 'openrun') === 'Y';
  const runDays = (Date.parse(to) - Date.parse(from)) / DAY + 1;

  if (tag(db, 'child') === 'Y') { skipped.child++; continue; }
  if (!openrun && runDays < config.minRunDays) { skipped.short++; continue; }
  if (config.excludeKeywords.some(k => title.includes(k))) { skipped.keyword++; continue; }

  const fcltynm = tag(db, 'fcltynm');
  const venueId = tag(db, 'mt10id');
  const hallId = tag(db, 'mt13id');
  const seats = hallSeats(hallId, await venue(venueId));
  const child = tag(db, 'child');
  const large = child === 'N' && seats != null && seats >= config.minSeats;

  shows.push({
    id, title, from, to, openrun,
    venue: fcltynm, venueId, hallId, seats, large, child,
    cast: tag(db, 'prfcast'),
    images: blocks(db, 'styurl').map(u => decode(u).replace(/^http:/, 'https:')),
    area: tag(db, 'area'),
    poster: tag(db, 'poster').replace(/^http:/, 'https:'),
    state: tag(db, 'prfstate'),
    prices: tag(db, 'pcseguidance'),
    times: tag(db, 'dtguidance'),
    runtime: tag(db, 'prfruntime'),
    age: tag(db, 'prfage'),
    producer: tag(db, 'entrpsnmP'),
    license: tag(db, 'musicallicense') === 'Y',
    creative: tag(db, 'musicalcreate') === 'Y',
    links: blocks(db, 'relate').map(r => ({ name: tag(r, 'relatenm'), url: tag(r, 'relateurl') })).filter(l => /^https?:\/\//.test(l.url)),
    registeredAt: tag(db, 'frstregdt'),
    updatedAt: tag(db, 'updatedate'),
  });
}

shows.sort((a, b) => a.from.localeCompare(b.from) || a.title.localeCompare(b.title, 'ko'));

const out = {
  generatedAt: new Date().toISOString(),
  source: '(재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)',
  criteria: { regions: config.regions, minSeats: config.minSeats, excludeChildren: true },
  shows,
};
await writeFile(new URL('data/venues.json', ROOT), JSON.stringify(venues, null, 2) + '\n');
await writeFile(new URL('data/shows.json', ROOT), JSON.stringify(out, null, 1) + '\n');

const large = shows.filter(s => s.large);
console.log(`저장 ${shows.length}건 (대극장 ${large.length}건) · 제외: 아동 ${skipped.child}, 단기 ${skipped.short}, 키워드 ${skipped.keyword}`);
const unknown = [...new Set(shows.filter(s => s.seats == null).map(s => s.venue))];
if (unknown.length) console.log(`좌석 수를 못 찾은 공연장 ${unknown.length}곳 (규모 미확인으로 공개 목록에서 제외):\n  ` + unknown.join('\n  '));

