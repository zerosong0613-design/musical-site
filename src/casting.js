// 캐스팅 조합 검색: 배역마다 한 명씩 골라, 모두 함께 서는 회차만 남긴다.
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const showTime = s => new Date(`${s.date}T${s.time}:00+09:00`).getTime();
const showDay = s => new Date(showTime(s) + 9 * 3600e3).getUTCDay();

// state.pick: 배역 순서대로, 선택한 배우 이름 또는 null
export function filterShows(shows, state, now = Date.now()) {
  return shows.filter(s => {
    const at = showTime(s);
    if (!state.includePast && at < now) return false;
    if (state.days.size && !state.days.has(showDay(s))) return false;
    if (state.time && state.time !== (s.time < '17:00' ? 'day' : 'night')) return false;
    return state.pick.every((name, i) => !name || s.cast[i] === name);
  });
}

export function mountCasting(el, casting, show) {
  const state = { pick: casting.roles.map(() => null), days: new Set(), time: null, includePast: false };
  const actors = casting.roles.map((_, i) => [...new Set(casting.shows.map(s => s.cast[i]))]);
  const key = s => `${s.date} ${s.time}`;

  // 막공은 표가 폐막일까지 있을 때만, 첫공은 명시된 것만 표시한다.
  const lastOf = {};
  if (show?.to && show.to === casting.shows.at(-1)?.date) casting.shows.forEach(s => s.cast.forEach(n => { lastOf[n] = key(s); }));
  const firstOf = casting.firstShow ?? {};

  const chip = (attrs, label, on) => `<button type="button" class="chip" ${attrs} aria-pressed="${on}">${esc(label)}</button>`;

  function render() {
    const now = Date.now();
    const list = filterShows(casting.shows, state, now);
    const picked = state.pick.filter(Boolean);
    el.innerHTML = `
      <div class="roles">${casting.roles.map((role, i) => `
        <div class="role"><span class="role-name">${esc(role)}</span>
          <div class="chips">${actors[i].map(n => chip(`data-role="${i}" data-name="${esc(n)}"`, n, state.pick[i] === n)).join('')}</div>
        </div>`).join('')}
      </div>
      <div class="filters">
        <div class="chips">
          ${chip('data-time="day"', '낮 공연', state.time === 'day')}${chip('data-time="night"', '밤 공연', state.time === 'night')}
          <span class="sep"></span>
          ${[1, 2, 3, 4, 5, 6, 0].map(d => chip(`data-day="${d}"`, DAYS[d], state.days.has(d))).join('')}
        </div>
        <label class="check"><input type="checkbox" data-past ${state.includePast ? 'checked' : ''}> 지난 회차 포함</label>
      </div>
      <p class="count"><strong>${list.length}</strong>회차${picked.length ? ` · ${picked.map(esc).join(' + ')}` : ''}
        ${picked.length || state.days.size || state.time ? '<button type="button" class="link" data-reset>조건 지우기</button>' : ''}</p>
      ${list.length ? `<ol class="showlist">${list.map(s => {
        const [, m, d] = s.date.split('-').map(Number);
        const day = showDay(s);
        return `<li class="${showTime(s) < now ? 'past' : ''}">
          <div class="when"><b>${m}/${d}</b> <span class="day d${day}">${DAYS[day]}</span> <span class="time">${s.time}</span></div>
          <div class="cast">${s.cast.map((n, i) => `<span class="${state.pick[i] === n ? 'hit' : ''}"><i>${esc(casting.roles[i])}</i>${esc(n)}${
            firstOf[n] === key(s) ? '<em class="tag first">첫공</em>' : ''}${lastOf[n] === key(s) ? '<em class="tag last">막공</em>' : ''}</span>`).join('')}</div>
        </li>`;
      }).join('')}</ol>` : '<p class="empty">조건에 맞는 회차가 없습니다.</p>'}
      <p class="note">${esc(casting.source)} · ${esc(casting.checkedAt)} 확인 · 표 범위 ${esc(casting.shows[0].date)} ~ ${esc(casting.shows.at(-1).date)}</p>`;
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.role) {
      const i = Number(b.dataset.role);
      state.pick[i] = state.pick[i] === b.dataset.name ? null : b.dataset.name;
    } else if (b.dataset.time) {
      state.time = state.time === b.dataset.time ? null : b.dataset.time;
    } else if (b.dataset.day) {
      const d = Number(b.dataset.day);
      state.days.has(d) ? state.days.delete(d) : state.days.add(d);
    } else if ('reset' in b.dataset) {
      state.pick.fill(null); state.days.clear(); state.time = null;
    } else return;
    render();
  });
  el.addEventListener('change', e => {
    if ('past' in e.target.dataset) { state.includePast = e.target.checked; render(); }
  });
  render();
}
