import {searchNews} from './lib/naver-news.mjs';
import { isEligibleShow } from '../src/show-filter.js';
// 공지 하나를 예매오픈/캐스팅 양쪽으로 분배한다. 비공식 글은 원문 발견·검토용이다.
import {readFile,writeFile} from 'node:fs/promises';
import {hash,extractImages,isBlocked} from './lib/source-images.mjs';
import {plain,relevant,matchShow,officialUrl,linksIn,makeAnnouncement,applyAnnouncements,sectionByClass} from './lib/announcements.mjs';
const ROOT=new URL('../',import.meta.url);
const read=async(p,f)=>readFile(new URL(p,ROOT),'utf8').then(JSON.parse,()=>f);
const save=(p,v)=>writeFile(new URL(p,ROOT),JSON.stringify(v,null,1)+'\n');
const config=await read('config.json',{});
const master=(await read('data/shows.json',{})).shows??[];
const manualShows=await read('data/shows.manual.json',[]);
const shows=[...master,...manualShows.filter(s=>!master.some(x=>x.id===s.id))].filter(s=>isEligibleShow(s)&&s.to>=new Date(Date.now()+9*3600e3).toISOString().slice(0,10));
const prior=await read('data/announcements.json',[]);const records=new Map(prior.map(a=>[a.id,a]));
const openings=await read('data/openings.json',[]),notices=await read('data/notices.json',[]);
const statuses=[];let pageCount=0;
const maxPages=config.announcements?.maxPagesPerRun??30;
const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
const cache=await read('data/announcement-pages.json',{});
const visited=new Set();
function register(input) {
 if(!relevant(input.text??input.title??''))return;
 const show=matchShow(plain(input.text??input.title??''),shows,input.mt20id);
 let a=makeAnnouncement(input,show,config);const old=records.get(a.id);
 if(input.stub&&old) a={...old,openings:a.openings,mt20id:a.mt20id??old.mt20id};
 if(old?.contentHash===a.contentHash) {a.at=old.at;a.performanceFrom??=old.performanceFrom;a.performanceTo??=old.performanceTo;}
 records.set(a.id,a);return a;
}
async function get(url,headers={}) {
 await new Promise(r=>setTimeout(r,700));
 const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (musical-site announcement check)',...headers},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(`HTTP ${r.status}`);return r;
}
async function page(url,input={}) {
 if(visited.has(url)||pageCount>=maxPages)return;visited.add(url);pageCount++;
 try {
  const r=await get(url);const html=await r.text();if(isBlocked(html))throw Error('접근 제한');
  // 리디렉션 최종 주소도 공식 도메인인지 검사한다.
  const final=r.url||url;
  let section=html;
  if(/ticketlink\.co\.kr/.test(new URL(final).hostname)&&/\/help\/notice\/\d+/.test(new URL(final).pathname)) {
   section=html.match(/<dd[^>]+class=["']list_cont["'][^>]*>([\s\S]*?)<\/dd>/i)?.[1]??html;
  }
  if(/dcinside\.com/.test(new URL(final).hostname)) {
   section=sectionByClass(html,'write_div')??'';
   if(!section)throw Error('게시글 본문 영역 미확인');
  }
  const title=plain(input.title??html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'');
  const body=plain(section)+' '+[...section.matchAll(/<img[^>]*alt=["']([^"']+)["']/gi)].map(m=>plain(m[1])).join(' ');
  const officialLinks=linksIn(section,final).filter(u=>officialUrl(u,config));
  const a=register({...input,url:final,title,text:title+' '+body,images:extractImages(section,final),officialLinks});
  // 같은 URL 내용이 수정되면 동일 공지에 갱신한다. 검사 실패 시 이전 공지는 보존한다.
  cache[url]={checkedAt:today,status:a?.status??'not_relevant',contentHash:hash(section)};
  if(a)statuses.push({url,status:a.status});
  if(!officialUrl(final,config)&&a)for(const original of officialLinks.slice(0,3))await page(original,{source:'원출처 공지',mt20id:a.mt20id});
 }catch(e){cache[url]={...cache[url],checkedAt:today,status:'fetch_failed',error:e.message};statuses.push({url,status:'fetch_failed'});}
}
// 수집된 예매처 목록의 시각은 기존 검증된 공급원 값을 사용하고 상세에서 판매기간·이미지를 보완한다.
for(const o of openings.filter(o=>o.at.slice(0,10)>=today&&(!process.env.ANNOUNCEMENT_TARGET_ID||o.mt20id===process.env.ANNOUNCEMENT_TARGET_ID))) {
 register({id:'announcement-'+hash(o.url).slice(0,20),url:o.url,title:o.title,text:o.title,source:o.vendor,vendor:o.vendor,round:o.round,openingAt:o.at,presale:o.presale,mt20id:o.mt20id,stub:true});
 if(!process.env.ANNOUNCEMENT_COMMUNITY_ONLY&&o.mt20id&&officialUrl(o.url,config))await page(o.url,{source:o.vendor,vendor:o.vendor,round:o.round,openingAt:o.at,presale:o.presale,mt20id:o.mt20id});
}
for(const n of notices.filter(n=>!n.announcementId&&n.mt20id))register({...n,text:n.text??n.excerpt??n.title,verified:n.account==='emk_musical'});
for(const item of await read('data/announcements.manual.json',[])) {
 // 사람이 확인한 URL/텍스트도 같은 분배기를 거친다. 확인하지 않은 글은 공개하지 않는다.
 register(item);if(item.url&&officialUrl(item.url,config))await page(item.url,item);
}
for(const [id,urls] of Object.entries(config.announcementSourceUrls??{}))for(const url of urls)if(!process.env.ANNOUNCEMENT_TARGET_ID||id===process.env.ANNOUNCEMENT_TARGET_ID)await page(url,{mt20id:id,source:'제작사·예매처 공지'});
if(!process.env.ANNOUNCEMENT_TARGET_ID&&config.announcements?.dcinside!==false) {
 const url='https://gall.dcinside.com/mini/board/lists/?id=theatergoing';
 try {
  const html=await (await get(url)).text();if(isBlocked(html))throw Error('접근 제한');
  let count=0;
  for(const tr of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
   if(!/>\s*정보\s*</.test(tr[0]))continue;
   const link=[...tr[0].matchAll(/<a[^>]*href=["']([^"']*\/mini\/board\/view\/?\?[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find(m=>relevant(plain(m[2])));
   if(!link)continue;if(count++>=8)break;
   await page(new URL(link[1].replaceAll('&amp;','&'),url).href,{title:plain(link[2]),source:'디씨 뮤지컬 연극 통합 갤러리'});
  }
  statuses.push({url,status:count?'checked':'no_matching_posts'});
 }catch(e){statuses.push({url,status:'fetch_failed',error:e.message});}
}
if(!process.env.ANNOUNCEMENT_TARGET_ID&&process.env.NAVER_CLIENT_ID&&process.env.NAVER_CLIENT_SECRET) {
 // 뉴스 검색 결과는 후보이다. 요약문만으로 날짜·배우를 확정하지 않는다.
 const queries=config.announcements?.newsQueries??['뮤지컬 티켓 오픈','뮤지컬 캐스팅 스케줄'];
 for(const query of queries.slice(0,5)) {
  try {
   const items=await searchNews(query,process.env,get);
   for(const n of items) {
    if(Date.now()-new Date(n.pubDate).getTime()>14*86400e3)continue;
    const text=plain(n.title+' '+n.description);const show=matchShow(text,shows);if(!show||!relevant(text))continue;
    const original=n.originallink||n.link;register({url:original,title:plain(n.title),text,source:'네이버 뉴스',at:new Date(n.pubDate).toISOString(),mt20id:show.id});
    await page(original,{source:'네이버 뉴스',at:new Date(n.pubDate).toISOString(),mt20id:show.id});
   }
   statuses.push({source:'네이버 뉴스',query,status:'checked'});
  }catch(e){statuses.push({source:'네이버 뉴스',query,status:'fetch_failed',error:e.message});}
 }
}else statuses.push({source:'네이버 뉴스',status:'not_configured'});
const announcements=[...records.values()].slice(-500);
const result=applyAnnouncements(announcements,openings,notices,await read('data/openings.manual.json',[]));
// 기존 예매처 공급원이 이후 갱신해도 이 단계가 메타데이터/스케줄 연결을 복원한다.
const cutoff=new Date(Date.now()+9*3600e3-7*86400e3).toISOString().slice(0,16).replace('T',' ');
await save('data/announcements.json',announcements);
await save('data/announcement-pages.json',cache);
await save('data/announcement-status.json',{checkedAt:new Date().toISOString(),sources:statuses});
await save('data/openings.json',result.openings.filter(o=>o.at>=cutoff));
await save('data/notices.json',result.notices.slice(0,500));
console.log(`통합 공지 ${announcements.length}건 · 확인 대기 ${announcements.filter(a=>a.status==='review_needed').length}건 · 예매오픈 ${result.openings.length}건`);
