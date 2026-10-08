// 멜론티켓 캐스팅 스케줄 → data/casting/{mt20id}.json
// shows.json에서 멜론티켓 예매 링크가 있는 대극장 작품만, 작품당 하루 한 번 요청한다.
// 멜론티켓 이용약관은 자동 수집을 금지한다. 운영자가 알고 결정한 사항이며, 요청 수는 최소로 유지한다.
import { readFile } from 'node:fs/promises';
import { writeCasting, rebuildIndex } from './lib/casting-file.mjs';

const ROOT = new URL('../', import.meta.url);
const API = 'https://tktapi.melon.com/api/product/prodSCastingchedule.json';
const GAP_MS = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const config = JSON.parse(await readFile(new URL('config.json', ROOT), 'utf8'));
const { shows: master } = JSON.parse(await readFile(new URL('data/shows.json', ROOT), 'utf8'));
// 멜론은 한 작품에 상품 번호가 여럿일 수 있다. KOPIS 링크의 번호에 config.json의 melonProdIds를 더해 모두 확인한다.
const targets = master
  .filter(s => s.large && s.to >= today)
  .map(s => ({
    show: s,
    prodIds: [...new Set([
      ...s.links.filter(l => /ticket\.melon\.com/.test(l.url)).map(l => l.url.match(/prodId=(\d+)/)?.[1]),
      ...(config.melonProdIds?.[s.id] ?? []),
    ].filter(Boolean))],
  }))
  .filter(t => t.prodIds.length);

async function fetchSchedule(show, prodId) {
  await sleep(GAP_MS);
  const qs = new URLSearchParams({
    v: '1', prodId,
    perfStartDate: show.from.replaceAll('-', ''), perfEndDate: show.to.replaceAll('-', ''),
    pocCode: 'SC0002', artistRoleJson: '[]',
  });
  const res = await fetch(`${API}?${qs}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (musical-site casting check)', referer: 'https://ticket.melon.com/' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== '0000') throw new Error(`응답 코드 ${data.code}`);
  return data;
}

let saved = 0;
let failed = 0;
for (const { show, prodIds } of targets) {
  const current = await readFile(new URL(`data/casting/${show.id}.json`, ROOT), 'utf8').then(JSON.parse, () => null);
  if (current && !current.auto) { console.log(`· ${show.title}: 수동 검증 데이터 보호`); continue; }
  let roleList = [];
  const byTime = new Map();
  let skipped = 0;
  let productFailures = 0;
  for (const prodId of prodIds) {
    try {
      const data = await fetchSchedule(show, prodId);
      const roles = (data.roleList ?? []).filter(r => r.useYn !== 'N').sort((a, b) => Number(a.orderNo) - Number(b.orderNo));
      if (!roles.length) continue;
      if (!roleList.length) roleList = roles;
      if (roles.map(r => r.roleName).sort().join('|') !== roleList.map(r => r.roleName).sort().join('|')) {
        console.error(`배역 구조 불일치: ${show.id}/${prodId}, 해당 상품 건너뜀`); continue;
      }
      for (const item of data.itemList ?? []) {
        const byRole = new Map((item.casting?.artistRoleList ?? []).map(a => [a.roleName, a.artistName?.trim()]));
        const cast = roleList.map(r => byRole.get(r.roleName));
        if (cast.some(n => !n)) { skipped++; continue; }
        const date = item.perfDay.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
        const time = item.perfTime.replace(/(\d\d)(\d\d)/, '$1:$2');
        byTime.set(`${date} ${time}`, { date, time, cast });
      }
    } catch (e) {
      console.error(`✗ ${show.title} / 상품 ${prodId}: ${e.message} (다른 상품 계속 조회)`);
      productFailures++;
    }
  }
  if (productFailures === prodIds.length) { failed++; continue; }
  const shows = [...byTime.values()];
  if (!shows.length) {
    console.log(`· ${show.title}: 캐스팅 스케줄 없음`);
    continue;
  }
  shows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // 표가 개막일부터 있으면 배우별 첫 출연이 곧 첫공이다.
  const firstShow = {};
  if (shows[0].date === show.from) for (const s of shows) for (const n of s.cast) firstShow[n] ??= `${s.date} ${s.time}`;

  await writeCasting({
    mt20id: show.id, title: show.title, year: Number(show.from.slice(0, 4)),
    roles: roleList.map(r => r.roleName),
    source: '멜론티켓 캐스팅 스케줄', auto: 'melon', checkedAt: today,
  }, shows, firstShow);
  saved++;
  console.log(`✓ ${show.title} (${show.id}) ${shows.length}회차, ${shows[0].date} ~ ${shows.at(-1).date}${skipped ? ` · 출연진 미정 ${skipped}회차 제외` : ''}`);
}

await rebuildIndex();
console.log(`멜론티켓: 대상 ${targets.length}편, 저장 ${saved}편, 실패 ${failed}편`);
if (targets.length && failed === targets.length) process.exit(1);

