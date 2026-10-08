// 예매처 티켓 오픈 공지 → data/openings.json
// 멜론티켓·예스24·티켓링크의 공지 목록에서 일시·제목·링크만 가져온다(본문은 가져오지 않는다).
// KOPIS에 아직 등록되지 않은 작품도 티켓 오픈은 먼저 공지되므로, 작품을 못 맞춰도 목록에는 남긴다.
// 한 곳이 실패해도 나머지는 반영하고, 실패한 곳의 기존 항목은 유지한다.
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const UA = 'Mozilla/5.0 (musical-site ticket-open check)';
const KEEP_DAYS = 7; // 지난 오픈은 일주일 뒤 지운다

const readJSON = async (path, fallback) => {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); } catch { return fallback; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => s.replace(/<\/?(?:b|i|em|strong|span|font|u|br|p)\b[^>]*>/gi, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const stamp = s => s.match(/(\d{4})[.-](\d{2})[.-](\d{2})\D+(\d{1,2}):(\d{2})/)?.slice(1).reduce((a, v, i) => a + ['', '-', '-', ' ', ':'][i] + v.padStart(2, '0'), '');

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...init.headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const SOURCES = {
  async 티켓링크() {
    const out = [];
    for (const page of [1, 2, 3]) {
      const body = await (await get(`https://mapi.ticketlink.co.kr/mapi/notice/list?page=${page}&itemPerPage=20`, { headers: { referer: 'https://www.ticketlink.co.kr/' } })).json();
      for (const n of body.data?.notices ?? []) {
        if (n.noticeCategoryCode !== 'TICKET_OPEN' || !n.ticketOpenDatetime) continue;
        out.push({ id: `ticketlink-${n.noticeId}`, at: stamp(n.ticketOpenDatetime), title: text(n.title), url: `https://www.ticketlink.co.kr/help/notice/${n.noticeId}` });
      }
      await sleep(1000);
    }
    return out;
  },
  async 멜론티켓() {
    const out = [];
    for (const page of [1, 2]) {
      const html = await (await get('https://ticket.melon.com/csoon/ajax/listTicketOpen.htm', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'https://ticket.melon.com/csoon/index.htm' },
        body: new URLSearchParams({ orderType: '0', pageIndex: String(page), schGcode: 'GENRE_ART_ALL', schText: '' }),
      })).text();
      for (const li of html.split(/<li[\s>]/).slice(1)) {
        const id = li.match(/csoonId=(\d+)/)?.[1];
        const at = stamp(li.match(/class="date">([^<]*)</)?.[1] ?? '');
        const title = text(li.match(/class="tit">([\s\S]*?)<\/a>/)?.[1] ?? '');
        if (id && at && title) out.push({ id: `melon-${id}`, at, title: (/단독판매/.test(li) ? '[단독판매] ' : '') + title, url: `https://ticket.melon.com/csoon/detail.htm?csoonId=${id}` });
      }
      await sleep(1000);
    }
    return out;
  },
  async 예스24() {
    const html = await (await get('https://ticket.yes24.com/New/Notice/Ajax/axList.aspx', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'https://ticket.yes24.com/New/Notice/NoticeMain.aspx' },
      body: new URLSearchParams({ page: '1', size: '40', genre: '', province: '', order: '', searchType: 'All', searchText: '뮤지컬' }),
    })).text();
    const out = [];
    for (const tr of html.split(/<tr[\s>]/).slice(1)) {
      const id = tr.match(/#id=(\d+)/)?.[1];
      const at = stamp(tr);
      const title = text(tr.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '').replace(/^단독판매\s*/, '[단독판매] ');
      if (id && at && title) out.push({ id: `yes24-${id}`, at, title, url: `https://ticket.yes24.com/New/Notice/NoticeMain.aspx#id=${id}` });
    }
    if (!out.length && !/티켓오픈/.test(html)) throw new Error('목록을 읽지 못했습니다(접근 제한 가능)');
    return out;
  },
  // NOL 티켓의 "오픈 예정" 화면. 연도 없이 "10.13(화) 11:00"으로만 나오므로 오늘과 가까운 해로 맞춘다.
  async 'NOL 티켓'() {
    const html = await (await get('https://nol.yanolja.com/ticket/display/upcoming', { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' } })).text();
    const now = new Date(Date.now() + 9 * 3600e3);
    const out = new Map();
    for (const [, href, card] of html.matchAll(/<a href="(\/ticket\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const d = card.match(/>(\d{1,2})\.(\d{1,2})\([^)]*\)\s*(\d{1,2}):(\d{2})</);
      const title = text(card.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
      if (!d || !title) continue;
      let year = now.getUTCFullYear();
      if (Number(d[1]) < now.getUTCMonth() + 1 - 5) year++; // 12월에 보는 1월 일정
      const badges = [...card.matchAll(/white-space_nowrap">([^<]*)<\/span>/g)].map(m => m[1]);
      const round = badges.find(b => /오픈/.test(b)) ?? '티켓오픈';
      const id = href.match(/(\d{6,})/)?.[1] ?? href;
      out.set(id, {
        id: `nol-${id}`, at: `${year}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')} ${d[3].padStart(2, '0')}:${d[4]}`,
        title: `${badges.some(b => /단독/.test(b)) ? '[단독판매] ' : ''}${title} ${round.replace(/(티켓)(오픈)/, ' $1$2')}`.replace(/\s+/g, ' '),
        url: `https://nol.yanolja.com${href}`,
      });
    }
    if (!out.size) throw new Error('오픈 예정 목록을 읽지 못했습니다');
    return [...out.values()];
  },
};

const config = await readJSON('config.json', {});
// KOPIS 등록 전이라 직접 넣어 둔 작품(shows.manual.json)도 함께 맞춰 본다.
const shows = [...((await readJSON('data/shows.json', {})).shows ?? []), ...(await readJSON('data/shows.manual.json', []))];
const previous = await readJSON('data/openings.json', []);

// 수도권 밖 공연 공지는 제목의 지역 표기로 걸러낸다.
const OTHER_REGIONS = /(부산|대구|대전|울산|세종|광주|청주|충주|전주|군산|익산|포항|경주|구미|안동|창원|김해|진주|거제|통영|천안|아산|당진|춘천|원주|강릉|속초|여수|순천|목포|광양|제주|서귀포|전남|전북|경남|경북|충남|충북|강원)/;
// 괄호·기호·공백을 빼고 글자만 비교한다. KOPIS 제목의 "[서울]" 같은 꼬리표는 먼저 뗀다.
const letters = s => s.replace(/[^\p{L}\p{N}]/gu, '');
const bare = s => letters(s.replace(/\s*[\[(].*$/, ''));

function classify(vendor, item) {
  const t = item.title;
  if (!/뮤지컬/.test(t) || !/오픈/.test(t)) return null;
  if ((config.excludeKeywords ?? []).some(k => t.includes(k)) || /가족|성탄|산타|인형극/.test(t)) return null;
  if (OTHER_REGIONS.test(t)) return null;
  const name = letters(t);
  const show = shows.filter(s => bare(s.title).length >= 2 && name.includes(bare(s.title))).sort((a, b) => bare(b.title).length - bare(a.title).length)[0];
  if (show && !show.large) return null; // 대상 밖(소극장 등)으로 확인된 작품
  return {
    id: item.id, at: item.at, title: t.replace(/^\[단독판매\]\s*/, ''), vendor,
    round: t.match(/(\d+\s*차|마지막|라스트|추가)\s*티켓\s*오픈/)?.[1].replace(/\s/g, '') ?? '',
    exclusive: /단독/.test(t), presale: /선예매/.test(t),
    url: item.url, mt20id: show?.id ?? null,
  };
}

const cutoff = new Date(Date.now() + 9 * 3600e3 - KEEP_DAYS * 86400e3).toISOString().slice(0, 16).replace('T', ' ');
const merged = new Map();
for (const p of previous.filter(p => !Object.hasOwn(SOURCES, p.vendor))) merged.set(p.id, p);
let failed = 0;
for (const [vendor, load] of Object.entries(SOURCES)) {
  try {
    const items = (await load()).map(i => classify(vendor, i)).filter(Boolean);
    // 성공한 예매처는 이번에 본 항목으로 갱신하되, 목록에서 밀려난 예전 항목도 남겨 둔다.
    for (const p of previous.filter(p => p.vendor === vendor)) merged.set(p.id, p);
    for (const i of items) merged.set(i.id, { ...merged.get(i.id), ...i });
    console.log(`✓ ${vendor}: 뮤지컬 티켓 오픈 ${items.length}건`);
  } catch (e) {
    failed++;
    for (const p of previous.filter(p => p.vendor === vendor)) merged.set(p.id, p);
    console.error(`✗ ${vendor}: ${e.message} (기존 항목 유지)`);
  }
}

const openings = [...merged.values()].filter(o => o.at >= cutoff).sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title, 'ko'));
await writeFile(new URL('data/openings.json', ROOT), JSON.stringify(openings, null, 1) + '\n');
console.log(`티켓 오픈 ${openings.length}건 저장`);
if (failed === Object.keys(SOURCES).length) process.exit(1);
