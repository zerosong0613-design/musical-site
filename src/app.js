import { actorMatch } from './actor-search.js?v=20261009-1';
import { isEligibleShow, readLargeOnly, saveLargeOnly } from './show-filter.js?v=20261009-2';
import { mountCasting } from './casting.js?v=20261009-5';
import { mergeOpenings, castingLink, mobileVendorUrl } from './announcement-links.js?v=20261009-4';
import { readFavorites, saveFavorites, favoritesFirst } from './favorites.js?v=20261009-1';
let storage; try { storage = window.localStorage; } catch {}
const favorites = readFavorites(storage);
let favoritesSaved = true;
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  favoritesSaved = saveFavorites(storage, favorites);
}
const favoriteButton = s => `<button type="button" class="favorite-btn" data-favorite="${esc(s.id)}" aria-pressed="${favorites.has(s.id)}" aria-label="${esc(s.title)} 즐겨찾기 ${favorites.has(s.id) ? '해제' : '추가'}">${favorites.has(s.id) ? '★ 즐겨찾기' : '☆ 즐겨찾기'}</button>`;

const app = document.getElementById('app');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//.test(u ?? '') ? u : '');
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간
const dot = iso => iso.replaceAll('-', '.');

async function getJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

const data = { shows: [], casting: new Map(), castingFiles: new Map(), openings: [], notices: [] };
const view = { tab: 'now', largeOnly: readLargeOnly(storage), actor: '', actorLoading: false };
const actorFailures = new Set();
async function loadActorSchedules() {
  const ids = data.shows.filter(s => s.to >= today() && isEligibleShow(s) && data.casting.has(s.id) && !data.castingFiles.has(s.id)).map(s => s.id);
  for (let start = 0; start < ids.length; start += 4) {
    await Promise.all(ids.slice(start, start + 4).map(async id => {
      const casting = data.castingFiles.get(id) || await getJSON(`data/casting/${id}.json`, null);
      data.castingFiles.set(id, casting);
      if (!casting) actorFailures.add(id);
    }));
  }
}

async function load() {
  const [file, castingIndex, auto, manual, notices, events, manualShows, posters] = await Promise.all([
    getJSON('data/shows.json'),
    getJSON('data/casting/index.json', []),
    getJSON('data/openings.json', []),
    getJSON('data/openings.manual.json', []),
    getJSON('data/notices.json', []),
    getJSON('data/casting/events.json', []),
    getJSON('data/shows.manual.json', []),
    getJSON('data/posters.json', {}),
  ]);
  // KOPIS에 아직 없는 작품은 직접 넣은 목록(shows.manual.json)으로 보여 주고, KOPIS에 같은 제목이 올라오면 그쪽을 쓴다.
  const letters = s => s.replace(/[^\p{L}\p{N}]/gu, '');
  const pending = manualShows.filter(m => !file.shows.some(s => letters(s.title).includes(letters(m.matchTitle ?? m.title))));
  data.shows = [...file.shows, ...pending].map(s => ({...s, poster: s.poster || safeUrl(posters[s.id]?.url)}));
  // 제작사 공지와, 수집한 캐스팅 표의 변화(새 구간 공개·배우 변경)를 한 목록으로 합친다.
  data.notices = [...notices.filter(n => n.kind !== 'opening'), ...events.map(eventNotice)].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  data.casting = new Map(castingIndex.map(c => [c.mt20id, c]));
  data.openings = mergeOpenings(auto, manual);
  if (file.generatedAt) document.getElementById('updated').textContent = `작품 정보 갱신: ${new Date(file.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
}

const poster = (s, showFavorite = false) => `<div class="poster" data-initial="${esc(s.title.slice(0, 1))}">${
  safeUrl(s.poster) ? `<img src="${esc(s.poster)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${showFavorite && favorites.has(s.id) ? '<span class="favorite-mark" role="img" aria-label="즐겨찾기">★</span>' : ''}</div>`;

function renderList() {
  const t = today();
  const matches = new Map();
  const pool = data.shows.filter(s => {
    if (s.to < t || !isEligibleShow(s, view.largeOnly ? 500 : 300)) return false;
    const match = actorMatch(s, data.castingFiles.get(s.id), view.actor);
    matches.set(s.id, match);
    return match.matched;
  });
  const now = favoritesFirst(pool.filter(s => s.from <= t), favorites, (a, b) => a.to.localeCompare(b.to));
  const soon = favoritesFirst(pool.filter(s => s.from > t), favorites, (a, b) => a.from.localeCompare(b.from));
  // 배우 검색은 탭에 갇히지 않고 공연 중·예정 작품을 함께 찾는다.
  const list = view.actor ? [...now, ...soon] : view.tab === 'now' ? now : soon;

  app.innerHTML = `
    <form class="actor-search" aria-label="배우 출연 작품 검색">
      <input type="search" name="actor" aria-label="배우 이름" placeholder="배우 이름으로 출연 작품 찾기" maxlength="80" value="${esc(view.actor)}">
      <button type="submit">검색</button>
      ${view.actor ? '<button type="button" data-actor-clear>해제</button>' : ''}
    </form>
    ${view.actor ? `<p class="note actor-help">현재 수집한 수도권·300석 이상 작품의 출연진과 캐스팅표에서 검색합니다. 결과가 없어도 출연작이 없다는 뜻은 아닙니다.${actorFailures.size ? ' 일부 캐스팅표를 불러오지 못해 결과가 누락될 수 있습니다.' : ''}</p>` : ''}
    <div class="bar">
      ${view.actor ? `<p class="actor-summary" role="status">${esc(view.actor)} 출연 작품 <strong>${list.length}</strong>편 <small>공연 중 ${now.length} · 예정 ${soon.length}</small>${view.actorLoading ? ' · 확인 중…' : ''}</p>` : `<div class="tabs" role="tablist">
        <button role="tab" data-tab="now" aria-selected="${view.tab === 'now'}">공연 중 <small>${now.length}</small></button>
        <button role="tab" data-tab="soon" aria-selected="${view.tab === 'soon'}">예정 <small>${soon.length}</small></button>
      </div>`}
      <label class="check large-filter"><input type="checkbox" data-large-only ${view.largeOnly ? 'checked' : ''}>대극장만 보기 <small>500석 이상</small></label>
      <span class="note scope-note">서울·경기·인천 · ${view.largeOnly ? '500' : '300'}석 이상 · 어린이 공연 제외</span>
    </div>
    ${list.length ? `<ul class="cards">${list.map(s => `
      <li><a class="card" href="#/show/${esc(s.id)}${view.actor ? '?actor=' + encodeURIComponent(view.actor) : ''}">
        ${poster(s, true)}
        <div class="info">
          <h2>${esc(s.title)}</h2>
          <p>${dot(s.from)} ~ ${s.openrun ? '오픈런' : dot(s.to)}</p>
          <p class="muted">${esc(s.venue)}</p>
          ${view.actor ? `<span class="badge">${matches.get(s.id).count ? '남은 출연 ' + matches.get(s.id).count + '회차' : matches.get(s.id).hasSchedule ? '확보한 표에 남은 출연 회차 없음' : '출연진 확인 · 회차 미확보'}</span>` : data.casting.has(s.id) ? '<span class="badge">캐스팅 검색</span>' : ''}
        </div>
      </a></li>`).join('')}</ul>` : `<p class="empty">${view.actorLoading ? '캐스팅표를 확인하는 중입니다…' : view.actor ? '확보한 정보에서 일치하는 배우를 찾지 못했습니다. 배우 이름 전체를 입력해 주세요.' : '해당하는 작품이 없습니다.'}</p>`}`;

  app.querySelector('.actor-search').addEventListener('submit', async e => {
    e.preventDefault();
    const actor = new FormData(e.currentTarget).get('actor').trim();
    view.actor = actor; view.actorLoading = !!actor;
    renderList();
    if (!actor) return;
    await loadActorSchedules();
    if (view.actor !== actor) return;
    view.actorLoading = false;
    if (!location.hash || location.hash === '#/') renderList();
  });
  app.querySelector('[data-actor-clear]')?.addEventListener('click', () => { view.actor = ''; view.actorLoading = false; renderList(); });
  app.querySelector('[data-large-only]').addEventListener('change', e => {
    view.largeOnly = e.currentTarget.checked;
    saveLargeOnly(storage, view.largeOnly);
    renderList();
  });
  app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { view.tab = b.dataset.tab; renderList(); }));
}

// 예스24 PC 공지 주소는 휴대폰에서 "모바일웹으로 이동" 안내 뒤 첫 화면으로 보내 버린다. 휴대폰에서는 모바일 공지 주소로 바꾼다.
const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const vendorUrl = url => mobileVendorUrl(url, isPhone);

function openingItems(list) {
  const now = Date.now();
  return `<ol class="openings">${list.map(o => {
    const at = new Date(`${o.at.replace(' ', 'T')}:00+09:00`);
    const k = new Date(at.getTime() + 9 * 3600e3);
    const show = data.shows.find(s => s.id === o.mt20id);
    const url = vendorUrl(safeUrl(o.url));
    const schedule = castingLink(o, data.casting);
    return `<li class="${at < now ? 'past' : ''}">
      <div class="when"><b>${k.getUTCMonth() + 1}/${k.getUTCDate()}</b> <span class="day d${k.getUTCDay()}">${DAYS[k.getUTCDay()]}</span> <span class="time">${esc(o.at.slice(11))}</span></div>
      <div class="what">
        <strong>${show ? `<a href="#/show/${esc(show.id)}">${esc(o.title)}</a>` : esc(o.title)}</strong>
        <span class="muted">${[o.vendor, o.round].filter(Boolean).map(esc).join(' · ')}</span>
        ${o.performanceFrom && o.performanceTo ? `<span class="excerpt">판매 공연기간: ${esc(dot(o.performanceFrom))} ~ ${esc(dot(o.performanceTo))}</span>` : ''}
        ${schedule ? `<a class="link" href="${esc(schedule)}">${o.performanceFrom ? '해당 기간 캐스팅 보기' : '캐스팅 보기'}</a>` : ''}
        ${o.exclusive ? '<em class="tag">단독</em>' : ''}${o.presale ? '<em class="tag">선예매</em>' : ''}
        ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">공지 원문</a>` : ''}
      </div>
    </li>`;
  }).join('')}</ol>`;
}

// 캐스팅 표 비교 기록(events.json)을 공지 한 줄로 바꾼다.
function eventNotice(e) {
  const md = iso => { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}`; };
  const day = iso => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  if (e.kind === 'changed') {
    return { ...e, kind: 'change', lines: e.changes.map(c => `${md(c.date)}(${day(c.date)}) ${c.time} ${c.role} ${c.from} → ${c.to}`) };
  }
  const range = e.from === e.to ? md(e.from) : `${md(e.from)} ~ ${md(e.to)}`;
  return { ...e, kind: 'schedule', lines: [`${e.kind === 'new' ? '캐스팅 스케줄 공개' : '캐스팅 스케줄 추가 공개'} · ${range} (${e.count}회차)`] };
}

function noticeItems(list) {
  return `<ol class="openings">${list.map(n => {
    const k = new Date(new Date(n.at).getTime() + 9 * 3600e3);
    const show = data.shows.find(s => s.id === n.mt20id);
    const url = vendorUrl(safeUrl(n.url));
    return `<li>
      <div class="when"><b>${k.getUTCMonth() + 1}/${k.getUTCDate()}</b> <span class="day d${k.getUTCDay()}">${DAYS[k.getUTCDay()]}</span></div>
      <div class="what">
        <em class="tag">${n.kind === 'change' ? '변경' : n.kind === 'roster' ? '출연진' : '스케줄'}</em>
        ${show ? `<strong><a href="#/show/${esc(show.id)}">${esc(show.title)}</a></strong>` : n.title ? `<strong>${esc(n.title)}</strong>` : ''}
        <span class="muted">${esc(n.source)}</span>
        ${n.lines
          ? `<span class="excerpt">${n.lines.slice(0, 6).map(esc).join('<br>')}${n.lines.length > 6 ? `<br>외 ${n.lines.length - 6}건` : ''}</span>`
          : `<span class="excerpt">${esc(n.excerpt)}…</span>`}
        ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">공지 원문</a>` : ''}
      </div>
    </li>`;
  }).join('')}</ol>`;
}

function renderNotices() {
  app.innerHTML = `<h1>캐스팅 공지</h1>
    <p class="note">예매처 캐스팅 표를 매일 비교해 새로 공개된 구간과 바뀐 배우를 올립니다. 예매처·제작사 공지를 함께 확인하며, 기사·커뮤니티에서 발견한 정보는 원출처 확인 후 반영합니다.</p>
    ${data.notices.length ? noticeItems(data.notices) : '<p class="empty">아직 수집된 공지가 없습니다.</p>'}`;
}

async function renderShow(id, range = {}) {
  const currentHash = location.hash;
  const s = data.shows.find(x => x.id === id);
  if (!s) { app.innerHTML = '<p class="empty">작품을 찾을 수 없습니다. <a href="#/">목록으로</a></p>'; return; }
  const rows = [
    ['기간', `${dot(s.from)} ~ ${s.openrun ? '오픈런' : dot(s.to)}`],
    ['공연장', s.venue + (s.seats ? ` · ${s.seats.toLocaleString()}석` : '')],
    ['출연진', s.cast], ['공연 시간', s.times], ['가격', s.prices], ['러닝타임', s.runtime], ['관람 연령', s.age], ['제작', s.producer],
  ].filter(r => r[1]);
  const naver = `https://search.naver.com/search.naver?query=${encodeURIComponent(`뮤지컬 ${s.title} 캐스팅 일정`)}`;
  const openings = data.openings.filter(o => o.mt20id === s.id);
  const notices = data.notices.filter(n => n.mt20id === s.id);

  app.innerHTML = `
    <a class="back" href="#/">← 작품 목록</a>
    <section class="detail">
      ${poster(s)}
      <div>
        <h1>${esc(s.title)}</h1>
        ${favoriteButton(s)}
        <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="links">
          ${s.links.filter(l => safeUrl(l.url)).map(l => `<a class="btn" href="${esc(vendorUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)} 예매</a>`).join('')}
          <a class="btn ghost" href="${naver}" target="_blank" rel="noopener">네이버에서 캐스팅 일정 보기</a>
        </div>
      </div>
    </section>
    ${openings.length ? `<section><h2>티켓 오픈</h2>${openingItems(openings)}</section>` : ''}
    ${notices.length ? `<section><h2>캐스팅 공지</h2>${noticeItems(notices)}</section>` : ''}
    <section><h2>캐스팅 검색</h2><div id="casting"></div></section>`;

  app.querySelector('[data-favorite]').addEventListener('click', e => {
    toggleFavorite(id); const button = e.currentTarget;
    button.setAttribute('aria-pressed', String(favorites.has(id)));
    button.setAttribute('aria-label', `${s.title} 즐겨찾기 ${favorites.has(id) ? '해제' : '추가'}`);
    button.textContent = favorites.has(id) ? '★ 즐겨찾기' : '☆ 즐겨찾기';
  });
  const box = app.querySelector('#casting');
  if (!data.casting.has(id)) { box.innerHTML = '<p class="empty">아직 등록된 캐스팅 표가 없습니다.</p>'; return; }
  box.innerHTML = '<p class="empty">불러오는 중…</p>';
  const casting = await getJSON(`data/casting/${id}.json`, null);
  if (!casting) { box.innerHTML = '<p class="empty">캐스팅 표를 불러오지 못했습니다.</p>'; return; }
  if (location.hash === currentHash) { box.innerHTML = ''; mountCasting(box, casting, s, range); }
}

function renderOpenings() {
  const t = today();
  const list = data.openings.filter(o => o.at.slice(0, 10) >= t);
  app.innerHTML = `<h1>티켓 오픈 일정</h1>${list.length ? openingItems(list) : '<p class="empty">등록된 오픈 일정이 없습니다.</p>'}`;
}

function route() {
  const basis = document.querySelector('#today-basis');
  const date = today();
  basis.dateTime = date;
  basis.textContent = `오늘 기준 ${dot(date)}`;
  const hash = location.hash || '#/';
  const show = hash.match(/^#\/show\/(\w+)(?:\?([^#]*))?$/);
  const nav = { '#/openings': 'openings', '#/notices': 'notices' }[hash] ?? 'shows';
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === nav));
  window.scrollTo(0, 0);
  if (show) { const params = new URLSearchParams(show[2] ?? ''); renderShow(show[1], {from: params.get('from'), to: params.get('to'), actor: params.get('actor')}); }
  else if (hash === '#/openings') renderOpenings();
  else if (hash === '#/notices') renderNotices();
  else renderList();
}

try {
  await load();
  window.addEventListener('hashchange', route);
  route();
} catch {
  app.innerHTML = '<p class="empty">데이터를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>';
}


