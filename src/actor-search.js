const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
export function sameActor(name, query) {
  return !!normalize(query) && normalize(name) === normalize(query);
}
export function initialActorPicks(casting, actor) {
  const picks = casting.roles.map((_, i) => [...new Set(casting.shows.map(row => row.cast[i]))].find(name => sameActor(name, actor)) ?? null);
  // 여러 배역에 같은 배우가 있으면 AND 조합 대신 배우 자체로 회차를 찾는다.
  return picks.filter(Boolean).length === 1 ? picks : picks.map(() => null);
}
export function actorMatch(show, casting, query, now = Date.now()) {
  const q = String(query ?? '').normalize('NFKC').trim();
  if (!q) return { matched: true, count: 0, hasSchedule: false };
  const rows = (casting?.shows ?? []).filter(row => row.cast.some(name => sameActor(name, q)));
  const upcoming = rows.filter(row => new Date(row.date + 'T' + row.time + ':00+09:00').getTime() >= now);
  // 목록 출연진은 독립된 이름으로만 일치시킨다(김준수 검색으로 김준수정 등을 찾지 않는다).
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const roster = new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{N}])', 'u').test(String(show.cast ?? '').normalize('NFKC'));
  return { matched: rows.length > 0 || roster, count: upcoming.length, hasSchedule: rows.length > 0 };
}
