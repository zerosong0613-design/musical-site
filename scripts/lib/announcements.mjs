import {cleanMarkupText as plain,isProductPage} from '../../src/source-content.js';
import { hash } from './source-images.mjs';
export const relevant = s => /티켓\s*오픈|예매\s*오픈|캐스팅|캐슷|캐스트|스케줄|캐변|casting\s*schedule/i.test(s);
export {cleanMarkupText as plain} from '../../src/source-content.js';
const letters=s=>s.replace(/[^\p{L}\p{N}]/gu,'');
export function matchShow(text, shows, preferredId) {
 const name=letters(text);
 let candidates=shows.filter(s=>name.includes(letters(s.matchTitle??s.title.replace(/\s*[\[(].*$/,''))));
 if(preferredId)return candidates.find(s=>s.id===preferredId)??null;
 if(candidates.length===1)return candidates[0];
 candidates=candidates.filter(s=>name.includes(letters(s.venue))||(/\[([^\]]+)\]/.exec(s.title)?.[1]&&name.includes(letters(/\[([^\]]+)\]/.exec(s.title)[1]))));
 return candidates.length===1?candidates[0]:null;
}
export function officialUrl(url, config={}) {
 try {
  const u=new URL(url);if(u.protocol!=='https:')return false;
  return ['ticketlink.co.kr','ticket.melon.com','nol.yanolja.com','tickets.interpark.com','ticket.yes24.com','m.ticket.yes24.com','ticket.clipservice.co.kr','emkmusical.com',...(config.announcementOfficialHosts??[])].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));
 }catch{return false;}
}
export function linksIn(html,base) {
 return [...new Set([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap(m=>{try{const u=new URL(m[1].replaceAll('&amp;','&'),base);return ['https:','http:'].includes(u.protocol)?[u.href]:[];}catch{return [];}}))];
}
export function validDate(s) {const d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
export function validStamp(s) {return typeof s==='string'&&validDate(s.slice(0,10))&&/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(s);}
const datePattern='(20\\d{2})\\s*(?:년|[.\\/-])\\s*(\\d{1,2})\\s*(?:월|[.\\/-])\\s*(\\d{1,2})\\s*일?';
const iso=m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
// 라벨 뒤 명시된 연도·날짜·시각만 읽는다. 기사 게시 시각/공연 시작 시각을 오픈 시각으로 쓰지 않는다.
export function openingDetails(text) {
 const stamps=[];
 const re=new RegExp('(?:일반\\s*예매|선\\s*예매|티켓\\s*오픈|예매\\s*오픈)\\s*(?:일시|일정)?\\s*[:：-]?\\s*'+datePattern+'\\s*(?:\\([^)]*\\))?\\s*(오전|오후)?\\s*(\\d{1,2})(?:\\s*시\\s*(?:(\\d{1,2})\\s*분)?|:(\\d{2}))','g');
 for(const m of text.matchAll(re)) {let hour=Number(m[5]);if(m[4]==='오후'&&hour<12)hour+=12;if(m[4]==='오전'&&hour===12)hour=0;const at=iso(m)+' '+String(hour).padStart(2,'0')+':'+(m[6]??m[7]??'0').padStart(2,'0');if(validStamp(at))stamps.push({at,presale:/선\s*예매/.test(m[0])});}
 const unique=[...new Map(stamps.map(s=>[s.at+':'+s.presale,s])).values()];
 let performanceFrom,performanceTo;
 const range=new RegExp('(?:티켓\\s*오픈\\s*공연기간|예매\\s*가능\\s*(?:공연)?기간|판매\\s*공연기간|오픈\\s*회차)\\s*[:：-]?\\s*'+datePattern+'\\s*(?:\\([^)]*\\))?\\s*[~～–-]\\s*'+datePattern).exec(text);
 if(range) {const from=iso(range),to=iso([null,...range.slice(4,7)]);if(validDate(from)&&validDate(to)&&from<=to){performanceFrom=from;performanceTo=to;}}
 return {openings:unique,performanceFrom,performanceTo};
}
export function makeAnnouncement(input,show,config={}) {
 const text=plain(input.text??'');
 const productOnly=isProductPage(input.url)&&!input.stub&&input.verified!==true;
 const trusted=!productOnly&&(officialUrl(input.url,config)||input.verified===true); // verified는 명시적인 수동 확인에만 사용
 const available=text.replace(/(?:캐스팅|캐스트)\s*(?:스케줄|일정)[^.!?]{0,30}(?:별도|추후|예정)[^.!?]{0,20}(?:공지|공개|발표)[^.!?]*/g,'');
 const schedule=!productOnly&&/(?:캐스팅|캐스트)\s*(?:스케줄|일정)|casting\s*schedule/i.test(available);
 const change=!productOnly&&/(?:캐스팅|캐스트|스케줄|배우)\s*변경|캐변/.test(text);
 const roster=!productOnly&&/(?:캐스팅|캐스트)\s*(?:공개|발표|라인업)|\[캐스팅\]|출연진|캐슷|캐스팅$/.test(available);
 const details=openingDetails(text);
 const vendor=input.vendor||(/ticketlink\.co\.kr/.test(input.url)?'티켓링크':/melon\.com/.test(input.url)?'멜론티켓':/yes24\.com/.test(input.url)?'예스24':/nol\.yanolja\.com|interpark\.com/.test(input.url)?'NOL 티켓':'');
 const supplied=validStamp(input.openingAt)?[{at:input.openingAt,presale:!!input.presale}]:[];
 return {id:input.id??'announcement-'+hash(input.url).slice(0,20),url:input.url,title:input.title??show?.title??'',source:input.source??'',at:input.at??new Date().toISOString(),mt20id:show?.id??null,excerpt:((change||schedule||roster)?available.slice(Math.max(0,available.search(/캐스팅|캐스트|출연진|casting/i))):text).slice(0,140),contentHash:hash(text),status:productOnly?'product_page':trusted&&show?'verified':'review_needed',kind:change?'change':schedule?'schedule':roster?'roster':'opening',hasCasting:change||schedule||roster,hasSchedule:schedule,openings:[...new Map([...details.openings,...supplied].map(o=>[o.at+':'+o.presale,o])).values()],performanceFrom:details.performanceFrom,performanceTo:details.performanceTo,round:input.round??text.match(/(\d+차|마지막|추가|라스트)\s*티켓\s*오픈/)?.[1]??'',vendor,images:input.images??[],officialLinks:input.officialLinks??[]};
}
export function applyAnnouncements(announcements,previous,notices,manual=[]) {
 const openings=new Map(previous.map(o=>[o.id,{...o}]));const cast=new Map(notices.map(n=>[n.id,n]));
 for(const a of announcements.filter(a=>a.status==='verified')) {
  for(const item of a.openings) {
   // 동일 작품·시각·예매처·선예매만 합친다. 별도의 예매처/선예매는 보존한다.
   const matches=[...openings.values()].filter(o=>o.mt20id===a.mt20id&&o.at===item.at&&o.vendor===a.vendor&&!!o.presale===item.presale);
   const existing=matches[0];const id=existing?.id??`${a.id}:${item.at}:${item.presale}`;
   if(manual.some(o=>o.mt20id===a.mt20id&&o.vendor===a.vendor&&o.at===item.at))continue;
   openings.set(id,{...existing,id,mt20id:a.mt20id,at:item.at,title:existing?.title??a.title,vendor:a.vendor||a.source,round:a.round||existing?.round||'',presale:item.presale,url:existing?.url??a.url,auto:existing?.auto??'announcement',announcementIds:[...new Set([...(existing?.announcementIds??[]),a.id])],performanceFrom:a.performanceFrom??existing?.performanceFrom,performanceTo:a.performanceTo??existing?.performanceTo});
  }
  if(a.hasCasting)cast.set(a.id,{id:a.id,mt20id:a.mt20id,title:a.title,at:a.at,url:a.url,source:a.source,kind:a.kind,excerpt:a.excerpt,announcementId:a.id});
 }
 return {openings:[...openings.values()].sort((a,b)=>a.at.localeCompare(b.at)),notices:[...cast.values()].sort((a,b)=>(b.at??'').localeCompare(a.at??''))};
}

export function sectionByClass(html, className) {
 const start=new RegExp('<div\\b[^>]*class=["\'][^"\']*\\b'+className+'\\b[^"\']*["\'][^>]*>','i').exec(html);
 if(!start)return null;
 let depth=1;const rest=html.slice(start.index+start[0].length);
 for(const tag of rest.matchAll(/<\/?div\b[^>]*>/gi)) {depth+=/^<\//.test(tag[0])?-1:1;if(!depth)return rest.slice(0,tag.index);}
 return null;
}
