// 직접 넣은 작품이 KOPIS에 올라오면, 임시 번호로 쌓인 기록을 KOPIS 번호로 옮긴다.
// 캐스팅 파일·원본 텍스트·공지·티켓 오픈·변경 기록을 한 번에 옮기고, 옮긴 짝은 data/show-aliases.json에 남긴다.
// 그래야 이후 자동 수집이 같은 파일에 이어 쌓이고, 예전 임시 주소도 새 작품 페이지로 이어진다.
import { readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { manualAliases } from '../../src/manual-shows.js';

// mt20id 값을 쓰는 데이터 파일. 배열·객체 어디에 있든 mt20id 필드만 바꾼다.
const ID_FILES = [
  'data/notices.json', 'data/openings.json', 'data/openings.manual.json',
  'data/announcements.json', 'data/announcements.manual.json',
  'data/casting/events.json',
];
// 작품 번호를 키로 쓰는 파일. 다음 수집 때 다시 만들어지지만, 그 사이 낡은 키가 남지 않게 옮긴다.
const KEYED_FILES = ['data/casting/image-sources.json', 'data/casting/source-audit.json'];

const readJSON = (root, p) => readFile(new URL(p, root), 'utf8').then(JSON.parse, () => undefined);
async function writeJSON(root, p, value, raw) {
  // 원래 파일의 들여쓰기(1칸·2칸)를 따른다. 불필요한 diff를 만들지 않기 위해서다.
  const indent = /^[[{]\n( +)/.exec(raw ?? '')?.[1].length ?? 2;
  const tmp = new URL(p + '.tmp', root);
  await writeFile(tmp, JSON.stringify(value, null, indent) + '\n');
  await rename(tmp, new URL(p, root));
}

function replaceIds(value, from, to) {
  let n = 0;
  const walk = v => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (k === 'mt20id' && x === from) { v[k] = to; n++; } else walk(x);
    }
  };
  walk(value);
  return n;
}

// 두 캐스팅 파일 합치기: KOPIS 번호 쪽 회차를 우선하고, 없는 회차만 임시 번호 쪽에서 가져온다.
// 배역 구성이 다르면 합치지 않는다(사람이 확인해야 한다).
export function mergeCastingFiles(target, source) {
  if (target.roles.length !== source.roles.length || !target.roles.every(r => source.roles.includes(r))) return null;
  const rows = new Map(source.shows.map(s => [`${s.date} ${s.time}`, { ...s, cast: target.roles.map(r => s.cast[source.roles.indexOf(r)]) }]));
  for (const s of target.shows) rows.set(`${s.date} ${s.time}`, s);
  const sources = [...new Set([...(source.sources ?? [source.source]), ...(target.sources ?? [target.source])].filter(Boolean))];
  return {
    ...target, sources,
    shows: [...rows.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    firstShow: { ...source.firstShow, ...target.firstShow },
  };
}

async function moveCasting(root, from, to, show, log) {
  const src = `data/casting/${from}.json`, dst = `data/casting/${to}.json`;
  const source = await readJSON(root, src);
  if (!source) return;
  const target = await readJSON(root, dst);
  const body = target ? mergeCastingFiles(target, source) : { ...source, mt20id: to, title: show.title };
  if (!body) { log.push(`${from} → ${to}: 배역 구성이 달라 캐스팅을 합치지 않음(확인 필요)`); return; }
  await writeJSON(root, dst, body);
  await rm(new URL(src, root));
  log.push(`${from} → ${to}: 캐스팅 ${source.shows.length}회차 ${target ? '병합' : '이동'}`);
}

// 원본 텍스트(data/casting/src)도 옮겨야 import-casting을 다시 돌렸을 때 임시 번호 파일이 되살아나지 않는다.
async function moveCastingSource(root, from, to, log) {
  const src = new URL(`data/casting/src/${from}.txt`, root), dst = new URL(`data/casting/src/${to}.txt`, root);
  const text = await readFile(src, 'utf8').catch(() => null);
  if (text === null) return;
  if (await readFile(dst, 'utf8').then(() => true, () => false)) { log.push(`${from}.txt: ${to}.txt가 이미 있어 그대로 둠(확인 필요)`); return; }
  await writeFile(dst, text.replace(/^(#\s*mt20id:\s*)\S+/m, `$1${to}`));
  await rm(src);
}

// casting-file.mjs의 rebuildIndex와 같은 모양. 테스트용 임시 폴더에서도 돌도록 root를 받는다.
async function rebuildCastingIndex(root) {
  const dir = new URL('data/casting/', root);
  const index = [];
  for (const f of (await readdir(dir)).filter(f => /^PF\w+\.json$/.test(f)).sort()) {
    const c = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
    index.push({ mt20id: c.mt20id, title: c.title, from: c.shows[0]?.date, to: c.shows.at(-1)?.date, checkedAt: c.checkedAt });
  }
  await writeJSON(root, 'data/casting/index.json', index);
}

export async function promoteManualShows(root) {
  const kopis = (await readJSON(root, 'data/shows.json'))?.shows ?? [];
  const manual = (await readJSON(root, 'data/shows.manual.json')) ?? [];
  const known = (await readJSON(root, 'data/show-aliases.json')) ?? {};
  const aliases = manualAliases(kopis, manual, known);
  const log = [];
  for (const [from, to] of aliases) {
    const show = kopis.find(s => s.id === to);
    await moveCasting(root, from, to, show, log);
    await moveCastingSource(root, from, to, log);
    for (const p of ID_FILES) {
      const raw = await readFile(new URL(p, root), 'utf8').catch(() => null);
      if (raw === null) continue;
      const value = JSON.parse(raw);
      const n = replaceIds(value, from, to);
      if (n) { await writeJSON(root, p, value, raw); log.push(`${p}: ${n}건 ${from} → ${to}`); }
    }
    for (const p of KEYED_FILES) {
      const raw = await readFile(new URL(p, root), 'utf8').catch(() => null);
      if (raw === null) continue;
      const value = JSON.parse(raw);
      if (!value?.shows?.[from]) continue;
      if (!value.shows[to]) value.shows[to] = { ...value.shows[from], title: show.title };
      delete value.shows[from];
      await writeJSON(root, p, value, raw);
    }
  }
  if (log.length) await rebuildCastingIndex(root);
  // 공연이 끝나 KOPIS 목록에서 빠져도 예전 임시 주소가 이어지도록, 한 번 생긴 짝은 지우지 않는다.
  const next = Object.fromEntries(Object.entries({ ...known, ...Object.fromEntries(aliases) }).sort());
  if (JSON.stringify(next) !== JSON.stringify(known)) await writeJSON(root, 'data/show-aliases.json', next);
  return { aliases, log };
}
