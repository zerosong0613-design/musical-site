// 티켓링크 캐스팅 일정 → data/casting/{mt20id}.json
// shows.json에서 티켓링크 예매 링크가 있는 대극장 작품만 확인한다.
// 작품당 요청: 배역표 1건 + 첫 배역 배우 수만큼(보통 2~4건). 한 회차에는 첫 배역 배우가 반드시 한 명 서므로
// 그 배우들의 일정을 합치면 전체 회차가 된다. 티켓링크는 남은 회차만 내려주므로 지난 회차는 기존 파일에서 이어 붙인다.
// 멜론·샤롯데씨어터·수동 입력으로 이미 들어온 작품은 건너뛴다.
// 티켓링크 이용약관의 자동 수집 조항은 확인하지 않았다. 요청 수는 최소로 유지한다.
import { readFile } from 'node:fs/promises';
import { writeCasting, rebuildIndex } from './lib/casting-file.mjs';

const ROOT = new URL('../', import.meta.url);
const API = 'https://mapi.ticketlink.co.kr/mapi';
const GAP_MS = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const kst = ms => new Date(ms + 9 * 3600e3).toISOString();
const today = kst(Date.now()).slice(0, 10);
const readJSON = async (path, fallback) => {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); } catch { return fallback; }
};

async function get(path, params) {
  await sleep(GAP_MS);
  const res = await fetch(`${API}/${path}${params ? `?${new URLSearchParams(params)}` : ''}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (musical-site casting check)', referer: 'https://www.ticketlink.co.kr/' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.success) throw new Error(body.result?.message ?? '응답 실패');
  return body.data;
}

const { shows: master } = await readJSON('data/shows.json', { shows: [] });
const targets = master
  .filter(s => s.large && s.to >= today)
  .map(s => ({ show: s, productId: s.links.find(l => /ticketlink\.co\.kr\/product\/\d+/.test(l.url))?.url.match(/product\/(\d+)/)?.[1] }))
  .filter(t => t.productId);

let saved = 0;
let failed = 0;
for (const { show, productId } of targets) {
  const current = await readJSON(`data/casting/${show.id}.json`, null);
  // 다른 경로(멜론·샤롯데·수동 입력)로 이미 들어온 작품은 건드리지 않는다.
  if (current && current.auto !== 'ticketlink') continue;

  try {
    const info = (await get(`product/cast/schedule/${productId}`)).cast;
    const actors = info?.allProductCastRole ?? [];
    if (!info?.castScheduleInformationUseYn || !actors.length) {
      console.log(`· ${show.title}: 캐스팅 일정 없음`);
      continue;
    }
    const roles = [...new Set(actors.map(a => a.productCastRoleName))];
    const roleOf = new Map(actors.map(a => [a.productCastActorId, roles.indexOf(a.productCastRoleName)]));
    const range = { startDate: show.from.replaceAll('-', '.'), endDate: show.to.replaceAll('-', '.') };

    const byTime = new Map();
    let skipped = 0;
    for (const lead of actors.filter(a => a.productCastRoleName === roles[0])) {
      const rounds = await get(`product/${productId}/cast`, { productId, actorIds: lead.productCastActorId, ...range });
      for (const round of rounds) {
        const at = kst(round.schedule?.startDatetime ?? round.productDate);
        const cast = roles.map(() => []);
        for (const a of round.scheduleActorList ?? []) cast[roleOf.get(a.productCastActorId)]?.push(a.personName.trim());
        if (cast.some(names => !names.length)) { skipped++; continue; }
        byTime.set(at.slice(0, 16), { date: at.slice(0, 10), time: at.slice(11, 16), cast: cast.map(names => names.join('·')) });
      }
    }
    if (!byTime.size) {
      console.log(`· ${show.title}: 남은 회차의 캐스팅 일정 없음`);
      continue;
    }

    // 지난 회차는 예전에 받아 둔 것을 유지한다(배역 구성이 같을 때만).
    const now = kst(Date.now()).slice(0, 16);
    if (current?.auto === 'ticketlink' && current.roles.join() === roles.join()) {
      for (const s of current.shows) {
        const key = `${s.date}T${s.time}`;
        if (key < now && !byTime.has(key)) byTime.set(key, s);
      }
    }
    const shows = [...byTime.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    await writeCasting({
      mt20id: show.id, title: show.title, year: Number(show.from.slice(0, 4)), roles,
      source: '티켓링크 캐스팅 일정 (예매 가능한 남은 회차 기준)', auto: 'ticketlink', checkedAt: today,
    }, shows, current?.auto === 'ticketlink' ? current.firstShow : {});
    saved++;
    console.log(`✓ ${show.title} (${show.id}) ${shows.length}회차, ${shows[0].date} ~ ${shows.at(-1).date}${skipped ? ` · 배역 미정 ${skipped}회차 제외` : ''}`);
  } catch (e) {
    console.error(`✗ ${show.title}: ${e.message} (기존 데이터 유지)`);
    failed++;
  }
}

await rebuildIndex();
console.log(`티켓링크: 대상 ${targets.length}편, 저장 ${saved}편, 실패 ${failed}편`);
if (targets.length && failed === targets.length) process.exit(1);
