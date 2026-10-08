// 캐스팅 표 텍스트 → data/casting/{mt20id}.json
// 사용: node scripts/import-casting.mjs data/casting/src/PF294946.txt
// 인자 없이 실행하면 data/casting/src/*.txt 전부를 변환한다.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeCasting, rebuildIndex } from './lib/casting-file.mjs';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('data/casting/src/', ROOT);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

async function convert(path) {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const meta = {};
  const rows = [];
  for (const l of lines) {
    const m = l.match(/^#\s*(\w+)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2];
    else if (!l.startsWith('#')) rows.push(l);
  }
  const errors = [];
  for (const k of ['mt20id', 'title', 'year', 'roles']) if (!meta[k]) errors.push(`머리말에 "# ${k}: ..." 가 없습니다`);
  if (errors.length) return { errors };

  const year = Number(meta.year);
  const roles = meta.roles.split(/\s+/).map(r => r.replaceAll('_', ' ')); // 띄어쓰기가 있는 배역은 "시드니_칼튼"처럼 적는다
  const shows = [];
  const count = roles.map(() => new Map());

  for (const row of rows) {
    const [md, day, time, ...cast] = row.split(/\s+/);
    if (!/^\d{4}$/.test(md) || !/^\d{1,2}:\d{2}$/.test(time ?? '')) { errors.push(`형식 오류: ${row}`); continue; }
    const date = `${year}-${md.slice(0, 2)}-${md.slice(2)}`;
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) { errors.push(`없는 날짜: ${row}`); continue; }
    if (DAYS[d.getUTCDay()] !== day) errors.push(`요일 불일치(달력은 ${DAYS[d.getUTCDay()]}요일): ${row}`);
    if (cast.length !== roles.length) { errors.push(`배역 수 ${cast.length}명, ${roles.length}명이어야 함: ${row}`); continue; }
    cast.forEach((n, i) => count[i].set(n, (count[i].get(n) ?? 0) + 1));
    shows.push({ date, time: time.padStart(5, '0'), cast });
  }
  shows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  shows.forEach((s, i) => { if (i && s.date + s.time === shows[i - 1].date + shows[i - 1].time) errors.push(`중복 회차: ${s.date} ${s.time}`); });

  const firstShow = Object.fromEntries((meta.firstShow ?? '').split(',').map(p => p.trim()).filter(Boolean).map(p => p.split('=').map(x => x.trim())));

  const head = { mt20id: meta.mt20id, title: meta.title, year, roles, source: meta.source ?? '', checkedAt: meta.checkedAt ?? '' };
  return { errors, head, firstShow, meta, roles, count, shows };
}

const args = process.argv.slice(2);
const files = args.length ? args : (await readdir(SRC)).filter(f => f.endsWith('.txt')).map(f => fileURLToPath(new URL(f, SRC)));
let failed = false;

for (const file of files) {
  const r = await convert(file);
  if (r.errors.length) {
    failed = true;
    console.error(`✗ ${file}\n  ` + r.errors.join('\n  '));
    continue;
  }
  await writeCasting(r.head, r.shows, r.firstShow);
  console.log(`✓ ${r.meta.title} (${r.meta.mt20id}) ${r.shows.length}회차`);
  // 이름 오타는 "1~2회만 나오는 배우"로 드러나는 경우가 많다. 눈으로 확인한다.
  r.roles.forEach((role, i) => console.log(`  ${role}: ` + [...r.count[i]].map(([n, c]) => `${n} ${c}`).join(', ')));
}

await rebuildIndex();
if (failed) process.exit(1);
