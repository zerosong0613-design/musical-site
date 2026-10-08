// 제작사 홈페이지에 실린 자사 인스타그램 피드 → data/notices.json
// 인스타그램에는 직접 접근하지 않는다. 제작사 홈페이지 한 장만 읽는다.
// 캐스팅 관련 글만 남기고, 본문은 앞부분 발췌와 원문 링크만 저장한다.
// 사용: node scripts/fetch-notices.mjs [--all]   (--all: 걸러지기 전 글 전체를 화면에 출력)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SHOW_ALL = process.argv.includes('--all');

// 홈페이지에 Smash Balloon 인스타그램 피드(sbi_item)를 싣는 제작사만 해당한다.
const SOURCES = [
  { account: 'emk_musical', name: 'EMK뮤지컬컴퍼니', url: 'https://emkmusical.com/' },
];

const KINDS = [
  ['change', /(캐스팅|캐스트|스케줄|배우)\s*변경|변경\s*안내/],
  ['schedule', /(캐스팅|캐스트)\s*(스케줄|일정)|cast(ing)?\s*schedule/i],
  ['roster', /캐스팅|캐스트|출연진/],
  ['opening', /티켓\s*오픈|예매\s*오픈|ticket\s*open/i],
];

const readJSON = async (path, fallback) => {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); } catch { return fallback; }
};
const decode = s => s
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/&#0?38;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
// 인스타 글의 장식용 굵은 영문(𝐂𝐀𝐒𝐓)과 빈칸 문자(⠀)를 보통 글자로 바꾼다.
const plain = s => decode(s).normalize('NFKC').replace(/⠀/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

function parse(html) {
  const seen = new Set();
  const posts = [];
  for (const item of html.split(/<div class="sbi_item/).slice(1)) {
    const id = item.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const date = Number(item.match(/data-date="(\d+)"/)?.[1]);
    posts.push({
      id,
      url: `https://www.instagram.com/p/${id}/`,
      at: date ? new Date(date * 1000).toISOString() : null,
      text: plain(item.match(/<img[^>]*alt="([^"]*)"/)?.[1] ?? ''),
      image: decode(item.match(/data-full-res="([^"]*)"/)?.[1] ?? ''),
      multi: /sbi_type_carousel/.test(item),
    });
  }
  return posts;
}

const { shows = [] } = await readJSON('data/shows.json', {});
const notices = await readJSON('data/notices.json', []);
const known = new Set(notices.map(n => n.id));
let added = 0;

for (const src of SOURCES) {
  let posts;
  try {
    const res = await fetch(src.url, { headers: { 'user-agent': 'Mozilla/5.0 (musical-site notice check)' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    posts = parse(await res.text());
    if (!posts.length) throw new Error('인스타그램 피드를 찾지 못했습니다(홈페이지 구조가 바뀌었을 수 있음)');
  } catch (e) {
    console.error(`✗ ${src.name}: ${e.message}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${src.name}: 최신 글 ${posts.length}개 확인`);

  for (const p of posts) {
    const kind = KINDS.find(([, re]) => re.test(p.text))?.[0];
    if (SHOW_ALL) console.log(`  ${kind ? '●' : '·'} ${p.at?.slice(0, 16)} ${p.id} ${p.text.replace(/\n/g, ' ').slice(0, 70)}`);
    if (!kind || known.has(p.id)) continue;

    // KOPIS 제목의 "[서울]", "(Musical ...)" 꼬리표는 떼고 맞춘다.
    const show = shows.find(s => p.text.includes(s.title.replace(/\s*[\[(].*$/, '')));
    notices.push({
      id: p.id, account: src.account, source: src.name, kind,
      at: p.at, url: p.url, mt20id: show?.id ?? null,
      excerpt: p.text.replace(/\n/g, ' ').slice(0, 140),
      multi: p.multi, text: p.text, images: p.image ? [p.image] : [],
    });
    known.add(p.id);
    added++;
    console.log(`  + [${kind}] ${p.url} ${show?.title ?? '(작품 미지정)'}`);

    // 표 변환용으로 첫 장을 받아 둔다. 주소가 금방 만료되므로 지금 받아야 한다.
    if (kind === 'schedule' && /^https:\/\//.test(p.image)) {
      try {
        const img = await fetch(p.image, { signal: AbortSignal.timeout(20000) });
        if (!img.ok) throw new Error(`HTTP ${img.status}`);
        await mkdir(new URL('inbox/', ROOT), { recursive: true });
        await writeFile(new URL(`inbox/${src.account}_${p.id}.jpg`, ROOT), Buffer.from(await img.arrayBuffer()));
        console.log(`    이미지 저장: inbox/${src.account}_${p.id}.jpg${p.multi ? ' (여러 장짜리 글: 나머지는 원문에서 직접 저장)' : ''}`);
      } catch (e) {
        console.log(`    이미지 저장 실패: ${e.message}`);
      }
    }
  }
}

if (added) {
  notices.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  await writeFile(new URL('data/notices.json', ROOT), JSON.stringify(notices, null, 1) + '\n');
}
console.log(`새 캐스팅 공지 ${added}건 (누적 ${notices.length}건)`);
