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
