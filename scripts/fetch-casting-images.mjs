// 예매처 공개 상세 페이지 → 자동 이미지 발견·다운로드·내용 변경 감지.
// 이미지 원본은 Actions artifact로 보관. 캐스팅 미확보를 성공으로 표시하지 않는다.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { hash,extractImages,isBlocked } from './lib/source-images.mjs';
const ROOT=new URL('../',import.meta.url);
const OUT=new URL('data/casting/image-sources.json',ROOT);
await mkdir(new URL('data/casting/',ROOT),{recursive:true});
const LOCAL=new URL('.cache/casting-images/',ROOT);await mkdir(LOCAL,{recursive:true});
const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
const config=JSON.parse(await readFile(new URL('config.json',ROOT),'utf8'));
const master=JSON.parse(await readFile(new URL('data/shows.json',ROOT),'utf8')).shows;
const previous=await readFile(OUT,'utf8').then(JSON.parse,()=>({shows:{}}));
const result={checkedAt:today,shows:{...previous.shows}};
async function get(url) {
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 return r;
}
for(const show of master.filter(s=>s.large&&s.to>=today&&(!process.env.CASTING_TARGET_ID||s.id===process.env.CASTING_TARGET_ID))) {
 const existing=await readFile(new URL(`data/casting/${show.id}.json`,ROOT),'utf8').then(JSON.parse,()=>null);
 // 자동 JSON 공급원이 오늘 갱신한 작품은 불필요한 이미지 요청을 줄인다.
 if(existing?.auto&&existing.checkedAt===today) continue;
 const sources=[...show.links.filter(l=>/clipservice\.co\.kr|yes24\.com|interpark\.com/.test(new URL(l.url).hostname)).map(l=>l.url),...(config.castingSourceUrls?.[show.id]??[])];
 const record={title:show.title,checkedAt:today,pages:[],images:[],status:'no_sources'};
 for(const url of [...new Set(sources)]) {
  await new Promise(r=>setTimeout(r,1000));
  try {
   const response=await get(url);const html=await response.text();
   if(isBlocked(html)) {record.pages.push({url,status:'blocked'});continue;}
   const images=extractImages(html,response.url);
   record.pages.push({url,status:images.length?'images_found':'no_images'});
   for(const imageUrl of images.slice(0,12)) {
    try {
     const response=await get(imageUrl);const type=response.headers.get('content-type')??'';
     if(!type.startsWith('image/'))continue;
     const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>15e6)continue;
     const digest=hash(bytes);const old=previous.shows?.[show.id]?.images?.find(i=>i.url===imageUrl);
     await writeFile(new URL(`${show.id}-${digest}.img`,LOCAL),bytes);
     record.images.push({url:imageUrl,pageUrl:url,sha256:digest,changed:old?.sha256!==digest,contentType:type});
    }catch {record.pages.push({url:imageUrl,status:'image_fetch_failed'});}
   }
  }catch(e){record.pages.push({url,status:'fetch_failed',error:e.message});}
 }
 record.status=record.images.length?'images_need_extraction':record.pages.some(p=>p.status==='blocked')?'blocked':record.pages.length?'not_found':'no_sources';
 if(!record.images.length&&previous.shows?.[show.id]?.images?.length) {record.images=previous.shows[show.id].images;record.retainedPreviousImages=true;}
 result.shows[show.id]=record;
 console.log(`${show.title}: ${record.status}, 상세 이미지 ${record.images.length}개`);
}
await writeFile(OUT,JSON.stringify(result,null,2)+'\n');
