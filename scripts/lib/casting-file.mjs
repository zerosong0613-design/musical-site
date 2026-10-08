// 공통 저장: 유효한 회차만 반영하고 다른 경로·미공개 기간의 기존 회차를 보존한다.
import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
const OUT = new URL('../../data/casting/', import.meta.url);
export function validateCasting(head, shows) {
  if (!/^PF\w+$/.test(head.mt20id) || !Array.isArray(head.roles) || !head.roles.length || new Set(head.roles).size !== head.roles.length) throw new Error('작품 ID 또는 배역 오류');
  if (!shows.length) throw new Error('빈 캐스팅표는 저장하지 않습니다.');
  const seen = new Set();
  for (const s of shows) {
    const d = new Date(`${s.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== s.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) throw new Error('날짜·시간 오류');
    if (!Array.isArray(s.cast) || s.cast.length !== head.roles.length || s.cast.some(n => typeof n !== 'string' || !n.trim())) throw new Error('출연진·배역 수 오류');
    const key = `${s.date} ${s.time}`;
    if (seen.has(key)) throw new Error('중복 회차');
    seen.add(key);
  }
}
export function mergeCasting(head, shows, current) {
  if (!head.auto || !current) return shows;
  if (!current.auto) throw new Error('수동 검증 캐스팅 보호: 자동 덮어쓰기 중단');
  if (current.roles.length !== head.roles.length || !head.roles.every(r => current.roles.includes(r))) throw new Error('기존 배역과 불일치: 자동 병합 중단');
  const rows = new Map(current.shows.map(s => [`${s.date} ${s.time}`, { ...s, cast: head.roles.map(r => s.cast[current.roles.indexOf(r)]) }]));
  for (const s of shows) rows.set(`${s.date} ${s.time}`, s);
  return [...rows.values()].sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
}
export async function writeCasting(head, shows, firstShow = {}) {
  validateCasting(head, shows);
  const path = new URL(`${head.mt20id}.json`, OUT);
  const current = await readFile(path, 'utf8').then(JSON.parse, () => null);
  const merged = mergeCasting(head, shows, current);
  validateCasting(head, merged);
  const sources = [...new Set([...(current?.sources ?? [current?.source]).filter(Boolean), head.source].filter(Boolean))];
  const body = { ...head, sources, shows: merged, firstShow: { ...(head.auto ? current?.firstShow : {}), ...firstShow } };
  const tmp = new URL(`${head.mt20id}.json.tmp`, OUT);
  await writeFile(tmp, JSON.stringify(body, null, 2)+'\n');
  await rename(tmp, path);
  await recordEvents(head, current, merged);
}

// 저장 전후를 비교해 "새 구간 공개"와 "캐스팅 변경"을 data/casting/events.json 에 남긴다.
// 사이트의 캐스팅 공지 화면이 이 기록을 보여준다. 지난 회차의 차이는 기록하지 않는다.
const EVENT_LIMIT = 300;
export function diffCasting(head, current, merged, today) {
  const key = s => `${s.date} ${s.time}`;
  const upcoming = merged.filter(s => s.date >= today);
  if (!current) return upcoming.length ? [{ kind: 'new', from: upcoming[0].date, to: upcoming.at(-1).date, count: upcoming.length }] : [];
  if (current.roles.length !== head.roles.length || !head.roles.every(r => current.roles.includes(r))) return []; // 배역 구성이 바뀌면 비교하지 않는다
  const before = new Map(current.shows.map(s => [key(s), head.roles.map(r => s.cast[current.roles.indexOf(r)])]));
  const added = [];
  const changes = [];
  for (const s of upcoming) {
    const old = before.get(key(s));
    if (!old) { added.push(s); continue; }
    s.cast.forEach((name, i) => { if (name !== old[i]) changes.push({ date: s.date, time: s.time, role: head.roles[i], from: old[i], to: name }); });
  }
  const events = [];
  if (added.length) events.push({ kind: 'added', from: added[0].date, to: added.at(-1).date, count: added.length });
  if (changes.length) events.push({ kind: 'changed', changes });
  return events;
}
async function recordEvents(head, current, merged) {
  const now = new Date();
  const events = diffCasting(head, current, merged, new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10));
  if (!events.length) return;
  const path = new URL('events.json', OUT);
  const log = await readFile(path, 'utf8').then(JSON.parse, () => []);
  for (const e of events) log.unshift({ at: now.toISOString(), mt20id: head.mt20id, title: head.title, source: head.source ?? '', ...e });
  await writeFile(path, JSON.stringify(log.slice(0, EVENT_LIMIT), null, 1) + '\n');
}
export async function rebuildIndex() {
  const index = [];
  for (const f of (await readdir(OUT)).filter(f => /^PF\w+\.json$/.test(f))) {
    const c = JSON.parse(await readFile(new URL(f, OUT), 'utf8'));
    index.push({ mt20id:c.mt20id, title:c.title, from:c.shows[0]?.date, to:c.shows.at(-1)?.date, checkedAt:c.checkedAt });
  }
  const tmp=new URL('index.json.tmp',OUT);
  await writeFile(tmp,JSON.stringify(index,null,2)+'\n');await rename(tmp,new URL('index.json',OUT));
}
