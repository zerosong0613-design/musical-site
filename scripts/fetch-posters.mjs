import {readFile,writeFile} from 'node:fs/promises';
import {posterPages,posterFromPage} from './lib/poster-source.mjs';
const ROOT=new URL('../',import.meta.url);
const read=(p,f)=>readFile(new URL(p,ROOT),'utf8').then(JSON.parse,()=>f);
const main=(await read('data/shows.json',{})).shows??[],manual=await read('data/shows.manual.json',[]);
const shows=[...main,...manual.filter(s=>!main.some(x=>x.id===s.id))];
const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
const posters=await read('data/posters.json',{});
for(const show of shows.filter(s=>s.large&&s.to>=today&&!s.poster)) {
 const attempts=[];let found=false;
 for(const pageUrl of posterPages(show.links??[])) {
  try {
   await new Promise(r=>setTimeout(r,500));
   const r=await fetch(pageUrl,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`페이지 HTTP ${r.status}`);
   const image=posterFromPage(await r.text(),r.url,show);if(!image)throw Error('작품명과 대표 포스터 확인 실패');
   const img=await fetch(image,{signal:AbortSignal.timeout(15000)});
   if(!img.ok||!/^image\//.test(img.headers.get('content-type')??''))throw Error('포스터 이미지 응답 오류');
   const bytes=new Uint8Array(await img.arrayBuffer());if(bytes.length<100||bytes.length>10e6)throw Error('포스터 크기 오류');
   posters[show.id]={url:image,sourcePage:pageUrl,checkedAt:today,status:'verified'};found=true;break;
  }catch(e){attempts.push({url:pageUrl,error:e.message});}
 }
 if(!found)posters[show.id]={...posters[show.id],lastAttemptAt:today,status:posters[show.id]?.url?'retained':'not_found',attempts};
 console.log(`${show.title}: ${found?'포스터 보완':posters[show.id].status}`);
}
await writeFile(new URL('data/posters.json',ROOT),JSON.stringify(posters,null,2)+'\n');
