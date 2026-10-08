// 샤롯데씨어터 "일정 안내" → data/casting/{mt20id}.json
// 현재 공연작의 날짜·시간·배역별 출연진이 글자로 올라와 있다. 달마다 한 번씩만 읽는다.
import { readFile } from 'node:fs/promises';
import { writeCasting, rebuildIndex } from './lib/casting-file.mjs';

const ROOT = new URL('../', import.meta.url);
const PAGE = 'https://www.charlottetheater.co.kr/performence/schedule.asp';
const GAP_MS = 700;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function get(params = '') {
  const res = await fetch(PAGE + params, { headers: { 'user-agent': 'Mozilla/5.0 (musical-site casting check)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 하루 블록 하나: 시간(span.date_time) 뒤에 그 회차의 배역 목록(ul)이 따라온다.
function parseMonth(html, roleCount, warn) {
  const shows = [];
  const days = html.split(/<div class="brief_ul[^"]*" id="id_/).slice(1);
  for (const day of days) {
    const date = day.slice(0, 10);
    for (const m of day.matchAll(/<span class="date_time[^"]*">\s*(\d{1,2}:\d{2})\s*<\/span>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/g)) {
      const cast = [...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(li => text(li[1].replace(/<span class="hide_text">[\s\S]*?<\/span>/, '')));
      if (cast.length !== roleCount || cast.some(n => !n)) { warn(`${date} ${m[1]} 출연진 미정 또는 형식 불일치, 건너뜀`); continue; }
      shows.push({ date, time: m[1].padStart(5, '0'), cast });
    }
  }
  return shows;
}

const first = await get();
const artSeq = first.match(/name="art_seq" value="(\d+)"/)?.[1];
const head = first.match(/<div class="bx_brief_ib">[\s\S]*?<strong>\s*([\s\S]*?)\s*<span>\s*(\d{4})년 (\d{2})월 (\d{2})일/);
const range = first.match(/출연진 확인 가능 일자[\s\S]*?(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
const roles = [...(first.match(/<div class="brief_ul clfix title">[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => text(m[1]));
if (!artSeq || !head || !range || !roles.length) {
  console.error('샤롯데씨어터 일정 페이지 구조를 읽지 못했습니다(구조가 바뀌었을 수 있음). 기존 데이터를 유지합니다.');
  process.exit(1);
}
const title = text(head[1]);
const opening = `${head[2]}-${head[3]}-${head[4]}`;
const [, from, to] = range;

const { shows: master } = JSON.parse(await readFile(new URL('data/shows.json', ROOT), 'utf8'));
const show = master.find(s => s.venue.includes('샤롯데') && s.title.includes(title));
if (!show) {
  console.error(`shows.json에서 샤롯데씨어터 "${title}"을(를) 찾지 못했습니다. fetch-kopis를 먼저 실행하세요.`);
  process.exit(1);
}

const warnings = [];
const shows = [];
let [y, m] = from.split('-').map(Number);
const [endY, endM] = to.split('-').map(Number);
while (y < endY || (y === endY && m <= endM)) {
  await sleep(GAP_MS);
  const html = await get(`?art_seq=${artSeq}&schYear=${y}&schMonth=${String(m).padStart(2, '0')}`);
  shows.push(...parseMonth(html, roles.length, w => warnings.push(w)));
  if (++m > 12) { m = 1; y++; }
}
shows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
if (!shows.length) {
  console.error('회차를 하나도 읽지 못했습니다. 기존 데이터를 유지합니다.');
  process.exit(1);
}

// 표가 개막일부터 있으면 배우별 첫 출연이 곧 첫공이다.
const firstShow = {};
if (shows[0].date === opening) for (const s of shows) for (const n of s.cast) firstShow[n] ??= `${s.date} ${s.time}`;

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
await writeCasting({
  mt20id: show.id, title: show.title, year: Number(opening.slice(0, 4)), roles,
  source: `샤롯데씨어터 홈페이지 일정 안내 (출연진 공개 구간 ${from} ~ ${to})`,
  auto: 'charlotte', checkedAt: today,
}, shows, firstShow);
await rebuildIndex();

console.log(`✓ ${show.title} (${show.id}) ${shows.length}회차, ${shows[0].date} ~ ${shows.at(-1).date}`);
roles.forEach((role, i) => {
  const count = new Map();
  shows.forEach(s => count.set(s.cast[i], (count.get(s.cast[i]) ?? 0) + 1));
  console.log(`  ${role}: ` + [...count].map(([n, c]) => `${n} ${c}`).join(', '));
});
if (warnings.length) console.log(`건너뛴 회차 ${warnings.length}건:\n  ` + warnings.join('\n  '));
