// KOPIS 등록 전이라 직접 넣은 작품(shows.manual.json)과 KOPIS 작품을 한 규칙으로 합친다.
// 브라우저(app.js)와 수집·빌드 스크립트가 모두 이 파일을 쓴다. 규칙이 갈라지면
// 한쪽은 KOPIS 번호, 다른 쪽은 임시 번호로 같은 작품을 가리키게 되기 때문이다.

// 괄호·기호·공백을 빼고 글자만 비교한다.
const letters = s => String(s ?? '').replace(/[^\p{L}\p{N}]/gu, '');
const overlaps = (a, b) => !a.from || !a.to || !b.from || !b.to || (a.from <= b.to && b.from <= a.to);

// 직접 넣은 작품에 해당하는 KOPIS 작품. 제목이 같고, 여러 편이면 기간이 겹치는 쪽을 고른다.
export function matchManualShow(manual, kopisShows) {
  const key = letters(manual.matchTitle ?? manual.title);
  if (!key) return null;
  const candidates = kopisShows.filter(s => s.id !== manual.id && letters(s.title).includes(key));
  return candidates.find(s => overlaps(s, manual)) ?? (candidates.length === 1 ? candidates[0] : null);
}

// 직접 넣은 번호 → KOPIS 번호. 예전에 옮긴 짝(data/show-aliases.json)도 함께 넘기면 그대로 이어 쓴다.
export function manualAliases(kopisShows, manualShows, known = {}) {
  const ids = new Set(kopisShows.map(s => s.id));
  const aliases = new Map(Object.entries(known).filter(([, to]) => ids.has(to)));
  for (const m of manualShows) {
    if (aliases.has(m.id)) continue;
    const hit = matchManualShow(m, kopisShows);
    if (hit) aliases.set(m.id, hit.id);
  }
  return aliases;
}

// 화면·수집에 쓰는 작품 목록: KOPIS 작품 + 아직 KOPIS에 없는 직접 넣은 작품.
export function resolveShows(kopisShows, manualShows, known = {}) {
  const aliases = manualAliases(kopisShows, manualShows, known);
  const pending = manualShows.filter(m => !aliases.has(m.id) && !kopisShows.some(s => s.id === m.id));
  return { shows: [...kopisShows, ...pending], aliases };
}

// 예전 임시 번호로 들어온 주소·기록을 KOPIS 번호로 바꾼다.
export const canonicalId = (id, aliases) => aliases.get(id) ?? id;
