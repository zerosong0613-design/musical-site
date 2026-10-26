// 배포용 정적 사이트를 dist/에 만든다: node scripts/build-site.mjs
// 검색엔진·AI는 JS를 실행하지 않거나 늦게 실행한다. 그래서 작품마다 실제 HTML 페이지(/show/PF…)를 미리 찍어 두고,
// 화면 동작은 그 위에서 기존 src/app.js가 그대로 맡는다.
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isEligibleShow } from '../src/show-filter.js';
import { mergeOpenings, castingLink } from '../src/announcement-links.js';
import { cleanMarkupText, isProductPage, sourceLinkLabel } from '../src/source-content.js';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const SITE = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || 'https://musical-moa.vercel.app').replace(/\/+$/, '');
const SITE_NAME = '뮤지컬 모아보기';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//.test(u ?? '') ? u : '');
const dot = iso => String(iso ?? '').replaceAll('-', '.');
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간
const md = iso => { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}`; };
const dayOf = iso => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const period = s => `${dot(s.from)} ~ ${s.openrun ? '오픈런' : dot(s.to)}`;
const showPath = id => `/show/${id}`;

const read = async (path, fallback) => {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
};

// ── 데이터: src/app.js의 load()와 같은 규칙으로 합친다 ──
const config = await read('config.json', {});
const file = await read('data/shows.json');
const manualShows = await read('data/shows.manual.json', []);
const posters = await read('data/posters.json', {});
const castingIndex = await read('data/casting/index.json', []);
const openingsAll = mergeOpenings(await read('data/openings.json', []), await read('data/openings.manual.json', []));
const noticesRaw = await read('data/notices.json', []);
const events = await read('data/casting/events.json', []);

const letters = s => s.replace(/[^\p{L}\p{N}]/gu, '');
const pending = manualShows.filter(m => !file.shows.some(s => letters(s.title).includes(letters(m.matchTitle ?? m.title))));
const shows = [...file.shows, ...pending].map(s => ({ ...s, poster: safeUrl(s.poster) || safeUrl(posters[s.id]?.url) }));
const castingMap = new Map(castingIndex.map(c => [c.mt20id, c]));
const castingFiles = new Map();
for (const c of castingIndex) castingFiles.set(c.mt20id, await read(`data/casting/${c.mt20id}.json`, null));

function eventNotice(e) {
  if (e.kind === 'changed') return { ...e, kind: 'change', lines: e.changes.map(c => `${md(c.date)}(${dayOf(c.date)}) ${c.time} ${c.role} ${c.from} → ${c.to}`) };
  const range = e.from === e.to ? md(e.from) : `${md(e.from)} ~ ${md(e.to)}`;
  return { ...e, kind: 'schedule', lines: [`${e.kind === 'new' ? '캐스팅 스케줄 공개' : '캐스팅 스케줄 추가 공개'} · ${range} (${e.count}회차)`] };
}
const notices = [...noticesRaw.filter(n => n.kind !== 'opening'), ...events.map(eventNotice)]
  .filter(n => !n.announcementId || !isProductPage(n.url) || !/상품상세|가격 할인정보|취소 및 환불규정/.test(n.excerpt ?? ''))
  .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

// 공개 회차 요약: 배역마다 배우와 남은 출연 회차 수
function castingSummary(casting) {
  if (!casting?.shows?.length) return null;
  const upcoming = casting.shows.filter(r => r.date >= today);
  const roles = casting.roles.map((role, i) => {
    const counts = new Map();
    for (const r of upcoming) if (r.cast[i]) counts.set(r.cast[i], (counts.get(r.cast[i]) ?? 0) + 1);
    return { role, actors: [...counts].sort((a, b) => b[1] - a[1]) };
  });
  return { upcoming, roles, actors: [...new Set(upcoming.flatMap(r => r.cast).filter(Boolean))] };
}

// ── 공통 조각 ──
const posterBox = s => `<div class="poster" data-initial="${esc(s.title.slice(0, 1))}">${s.poster ? `<img src="${esc(s.poster)}" alt="${esc(s.title)} 포스터" loading="lazy">` : ''}</div>`;

function openingItems(list) {
  const now = Date.now();
  return `<ol class="openings">${list.map(o => {
    const at = new Date(`${o.at.replace(' ', 'T')}:00+09:00`);
    const k = new Date(at.getTime() + 9 * 3600e3);
    const show = shows.find(s => s.id === o.mt20id);
    const url = safeUrl(o.url);
    const schedule = castingLink(o, castingMap);
    return `<li class="${at < now ? 'past' : ''}">
      <div class="when"><b>${k.getUTCMonth() + 1}/${k.getUTCDate()}</b> <span class="day d${k.getUTCDay()}">${DAYS[k.getUTCDay()]}</span> <span class="time">${esc(o.at.slice(11))}</span></div>
      <div class="what">
        <strong>${show ? `<a href="${showPath(show.id)}">${esc(o.title)}</a>` : esc(o.title)}</strong>
        <span class="muted">${[o.vendor, o.round].filter(Boolean).map(esc).join(' · ')}</span>
        ${o.performanceFrom && o.performanceTo ? `<span class="excerpt">판매 공연기간: ${esc(dot(o.performanceFrom))} ~ ${esc(dot(o.performanceTo))}</span>` : ''}
        ${schedule ? `<a class="link" href="${esc(schedule)}">${o.performanceFrom ? '해당 기간 캐스팅 보기' : '캐스팅 보기'}</a>` : ''}
        ${o.exclusive ? '<em class="tag">단독</em>' : ''}${o.presale ? '<em class="tag">선예매</em>' : ''}
        ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${sourceLinkLabel(url)}</a>` : ''}
      </div>
    </li>`;
  }).join('')}</ol>`;
}

function noticeItems(list) {
  return `<ol class="openings">${list.map(n => {
    const k = new Date(new Date(n.at).getTime() + 9 * 3600e3);
    const show = shows.find(s => s.id === n.mt20id);
    const url = safeUrl(n.url);
    return `<li>
      <div class="when"><b>${k.getUTCMonth() + 1}/${k.getUTCDate()}</b> <span class="day d${k.getUTCDay()}">${DAYS[k.getUTCDay()]}</span></div>
      <div class="what">
        <em class="tag">${n.kind === 'change' ? '변경' : n.kind === 'roster' ? '출연진' : '스케줄'}</em>
        ${show ? `<strong><a href="${showPath(show.id)}">${esc(show.title)}</a></strong>` : n.title ? `<strong>${esc(n.title)}</strong>` : ''}
        <span class="muted">${esc(n.source)}</span>
        ${n.lines
          ? `<span class="excerpt">${n.lines.slice(0, 6).map(esc).join('<br>')}${n.lines.length > 6 ? `<br>외 ${n.lines.length - 6}건` : ''}</span>`
          : `<span class="excerpt">${esc(cleanMarkupText(n.excerpt))}…</span>`}
        ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${sourceLinkLabel(url)}</a>` : ''}
      </div>
    </li>`;
  }).join('')}</ol>`;
}

// ── 페이지 껍데기: index.html에 페이지별 제목·설명·구조화 데이터·본문을 끼운다 ──
const template = await readFile(new URL('index.html', ROOT), 'utf8');
const verification = Object.entries({ 'google-site-verification': config.siteVerification?.google, 'naver-site-verification': config.siteVerification?.naver })
  .filter(([, v]) => v).map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join('\n');
const ldScript = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function page({ path, title, description, body, ld = [], image, noindex = false }) {
  const url = SITE + path;
  const head = [
    noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    verification,
    ...ld.map(ldScript),
  ].filter(Boolean).join('\n');
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace('<!--seo-->', head)
    .replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${body}</main>`);
}

async function emit(relPath, html) {
  const target = new URL(relPath, DIST);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, html);
}

// ── 빌드 ──
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(new URL('src/', ROOT), new URL('src/', DIST), { recursive: true });
await cp(new URL('data/', ROOT), new URL('data/', DIST), { recursive: true, filter: src => !/[\\/]data[\\/]casting[\\/]src([\\/]|$)/.test(src) });

const listed = shows.filter(s => s.to >= today && isEligibleShow(s));
const now = listed.filter(s => s.from <= today).sort((a, b) => a.to.localeCompare(b.to));
const soon = listed.filter(s => s.from > today).sort((a, b) => a.from.localeCompare(b.from));
const card = s => `<li><a class="card" href="${showPath(s.id)}">${posterBox(s)}<div class="info">
  <h3>${esc(s.title)}</h3><p>${period(s)}</p><p class="muted">${esc(s.venue)}</p>
  ${castingMap.has(s.id) ? '<span class="badge">캐스팅 검색</span>' : ''}</div></a></li>`;

// 1) 첫 화면
await emit('index.html', page({
  path: '/',
  title: '뮤지컬 모아보기 · 수도권 뮤지컬 캐스팅 스케줄·티켓 오픈',
  description: `서울·경기·인천 300석 이상 뮤지컬 ${listed.length}편의 공연 일정, 배역별 캐스팅 조합 검색, 배우 출연 회차, 티켓 오픈 일정을 매일 모아 보여 줍니다.`,
  body: `<h1>수도권 뮤지컬 캐스팅 스케줄·티켓 오픈 모아보기</h1>
    <p class="note">서울·경기·인천 300석 이상 뮤지컬을 공연예술통합전산망(KOPIS)과 예매처 캐스팅표에서 매일 모읍니다. ${dot(today)} 기준 공연 중 ${now.length}편 · 예정 ${soon.length}편.</p>
    <h2>공연 중</h2><ul class="cards">${now.map(card).join('')}</ul>
    <h2>공연 예정</h2><ul class="cards">${soon.map(card).join('')}</ul>`,
  ld: [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE + '/', inLanguage: 'ko',
      description: '수도권 300석 이상 뮤지컬의 캐스팅 스케줄, 배우 출연 회차, 티켓 오픈 일정 모음' },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: '공연 중·예정 뮤지컬',
      itemListElement: [...now, ...soon].map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + showPath(s.id), name: s.title })) },
  ],
}));

// 2) 작품마다 한 페이지
const priceNumbers = s => (String(s.prices ?? '').match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) ?? []).map(n => Number(n.replaceAll(',', ''))).filter(n => n >= 1000);
for (const s of shows) {
  const casting = castingFiles.get(s.id);
  const sum = castingSummary(casting);
  const openings = openingsAll.filter(o => o.mt20id === s.id);
  const showNotices = notices.filter(n => n.mt20id === s.id);
  const links = (s.links ?? []).filter(l => safeUrl(l.url));
  const rows = [
    ['기간', period(s)],
    ['공연장', s.venue + (s.seats ? ` · ${Number(s.seats).toLocaleString()}석` : '')],
    ['출연진', s.cast], ['공연 시간', s.times], ['가격', s.prices], ['러닝타임', s.runtime], ['관람 연령', s.age], ['제작', s.producer],
  ].filter(r => r[1]);
  const naver = `https://search.naver.com/search.naver?query=${encodeURIComponent(`뮤지컬 ${s.title} 캐스팅 일정`)}`;

  let castingHtml = '<p class="empty">아직 등록된 캐스팅 표가 없습니다.</p>';
  if (sum) {
    const { upcoming, roles } = sum;
    castingHtml = `
      <p>${upcoming.length
        ? `${esc(s.title)} 캐스팅표는 ${esc(dot(upcoming[0].date))}부터 ${esc(dot(upcoming.at(-1).date))}까지 남은 ${upcoming.length}회차가 공개되어 있습니다.`
        : `${esc(s.title)}의 공개된 캐스팅 회차는 모두 지났습니다.`} (${esc(casting.source)} · ${esc(casting.checkedAt)} 확인)</p>
      ${upcoming.length ? `<h3>배역별 출연 배우</h3>
      <dl class="role-summary">${roles.map(r => `<dt>${esc(r.role)}</dt><dd>${r.actors.map(([n, c]) => `${esc(n)} ${c}회`).join(', ')}</dd>`).join('')}</dl>
      <h3>회차별 캐스팅</h3>
      <div class="tablewrap"><table class="casttable">
        <thead><tr><th>일시</th>${casting.roles.map(r => `<th>${esc(r)}</th>`).join('')}</tr></thead>
        <tbody>${upcoming.map(r => `<tr><td class="when"><b>${md(r.date)}</b> <span class="day d${new Date(`${r.date}T00:00:00Z`).getUTCDay()}">${dayOf(r.date)}</span><span class="time">${esc(r.time)}</span></td>${r.cast.map((n, i) => `<td data-label="${esc(casting.roles[i])}">${esc(n)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }

  const roleNames = sum?.roles.map(r => r.role).slice(0, 6).join('·');
  const description = clip([
    `${s.title} 캐스팅 스케줄${sum?.upcoming.length ? `(남은 ${sum.upcoming.length}회차)` : ''}과 배우별 출연 회차.`,
    `${period(s)}, ${s.venue}.`,
    roleNames ? `배역 ${roleNames}.` : '',
    '티켓 오픈 일정과 예매처 링크까지 한 번에.',
  ].filter(Boolean).join(' '), 155);

  const performers = (sum?.actors.length ? sum.actors : String(s.cast ?? '').replace(/\s*등\s*$/, '').split(/\s*,\s*/).filter(Boolean)).slice(0, 40);
  const prices = priceNumbers(s);
  const event = {
    '@context': 'https://schema.org', '@type': 'TheaterEvent',
    name: s.title, url: SITE + showPath(s.id), inLanguage: 'ko',
    description: `${s.title} 뮤지컬 공연. ${period(s)}, ${s.venue}.`,
    startDate: s.from, ...(s.openrun ? {} : { endDate: s.to }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'PerformingArtsTheater', name: s.venue,
      address: { '@type': 'PostalAddress', ...(s.area ? { addressRegion: s.area } : {}), addressCountry: 'KR' } },
    ...(s.poster ? { image: [s.poster] } : {}),
    ...(performers.length ? { performer: performers.map(name => ({ '@type': 'Person', name })) } : {}),
    ...(s.producer ? { organizer: { '@type': 'Organization', name: s.producer } } : {}),
    ...(links.length ? { offers: {
      '@type': 'AggregateOffer', url: links[0].url, priceCurrency: 'KRW', offerCount: links.length,
      ...(prices.length ? { lowPrice: Math.min(...prices), highPrice: Math.max(...prices) } : {}),
    } } : {}),
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: s.title, item: SITE + showPath(s.id) },
  ] };

  await emit(`show/${s.id}.html`, page({
    path: showPath(s.id),
    title: `${s.title} 캐스팅 스케줄·티켓 오픈 | ${SITE_NAME}`,
    description, image: s.poster, ld: [event, crumbs],
    body: `<a class="back" href="/">← 작품 목록</a>
    <section class="detail">${posterBox(s)}<div>
      <h1>${esc(s.title)}</h1>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="links">${links.map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} 예매</a>`).join('')}
        <a class="btn ghost" href="${naver}" target="_blank" rel="noopener">네이버에서 캐스팅 일정 보기</a></div>
    </div></section>
    ${openings.length ? `<section><h2>티켓 오픈</h2>${openingItems(openings)}</section>` : ''}
    ${showNotices.length ? `<section><h2>캐스팅 공지</h2>${noticeItems(showNotices)}</section>` : ''}
    <section><h2>캐스팅 스케줄</h2>${castingHtml}</section>`,
  }));
}

// 3) 캐스팅 공지 · 티켓 오픈
await emit('notices.html', page({
  path: '/notices',
  title: `뮤지컬 캐스팅 공지 | ${SITE_NAME}`,
  description: '예매처 캐스팅표를 매일 비교해 새로 공개된 스케줄과 바뀐 배우, 제작사 캐스팅 공지를 모아 보여 줍니다.',
  body: `<h1>캐스팅 공지</h1>
    <p class="note">예매처 캐스팅 표를 매일 비교해 새로 공개된 구간과 바뀐 배우를 올립니다. 예매처·제작사 공지를 함께 확인하며, 기사·커뮤니티에서 발견한 정보는 원출처 확인 후 반영합니다.</p>
    ${notices.length ? noticeItems(notices.slice(0, 80)) : '<p class="empty">아직 수집된 공지가 없습니다.</p>'}`,
}));
const upcomingOpenings = openingsAll.filter(o => o.at.slice(0, 10) >= today);
await emit('openings.html', page({
  path: '/openings',
  title: `뮤지컬 티켓 오픈 일정 | ${SITE_NAME}`,
  description: `인터파크(NOL)·예스24·티켓링크·멜론티켓 등 예매처의 뮤지컬 티켓 오픈 일정 ${upcomingOpenings.length}건을 날짜순으로 모아 보여 줍니다.`,
  body: `<h1>티켓 오픈 일정</h1>${upcomingOpenings.length ? openingItems(upcomingOpenings) : '<p class="empty">등록된 오픈 일정이 없습니다.</p>'}`,
}));

// 4) 없는 주소: 앱이 "작품을 찾을 수 없습니다"를 보여 주되 검색엔진에는 올리지 않는다
await emit('404.html', page({ path: '/404', title: `페이지를 찾을 수 없습니다 | ${SITE_NAME}`, description: '요청한 페이지가 없습니다.', noindex: true,
  body: '<p class="empty">페이지를 찾을 수 없습니다. 공연이 끝나 목록에서 빠졌을 수 있습니다. <a href="/">작품 목록으로</a></p>' }));

// 5) 사이트맵 · robots · llms.txt
const lastmod = s => [castingFiles.get(s.id)?.checkedAt, s.updatedAt?.slice(0, 10), s.registeredAt?.slice(0, 10)].filter(Boolean).sort().at(-1) ?? today;
const indexed = shows.filter(s => s.to >= today);
const urls = [
  { loc: '/', lastmod: today, priority: '1.0' },
  { loc: '/openings', lastmod: today, priority: '0.8' },
  { loc: '/notices', lastmod: today, priority: '0.8' },
  ...indexed.map(s => ({ loc: showPath(s.id), lastmod: lastmod(s), priority: isEligibleShow(s) ? '0.9' : '0.5' })),
];
await writeFile(new URL('sitemap.xml', DIST), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(SITE + u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`);
await writeFile(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
await writeFile(new URL('llms.txt', DIST), `# ${SITE_NAME}

> 서울·경기·인천 300석 이상 뮤지컬의 공연 일정, 회차별 캐스팅 스케줄, 배우 출연 회차, 티켓 오픈 일정을 매일 모아 보여 주는 사이트입니다. 공연 정보는 공연예술통합전산망(KOPIS), 캐스팅은 예매처·제작사 공지 기준입니다. ${dot(today)} 갱신.

## 페이지
- [작품 목록](${SITE}/): 공연 중·예정 뮤지컬
- [티켓 오픈 일정](${SITE}/openings): 예매처별 오픈 일시
- [캐스팅 공지](${SITE}/notices): 새로 공개된 스케줄과 배우 변경

## 작품별 캐스팅 스케줄
${listed.map(s => `- [${s.title}](${SITE}${showPath(s.id)}): ${period(s)}, ${s.venue}${castingMap.has(s.id) ? ', 회차별 캐스팅표 있음' : ''}`).join('\n')}
`);

console.log(`dist/ 생성: 작품 페이지 ${shows.length}개, 사이트맵 ${urls.length}개 주소 (${SITE})`);
