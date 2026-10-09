import test from 'node:test';import assert from 'node:assert/strict';
import { readFile,mkdtemp,mkdir,writeFile,copyFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';import { join } from 'node:path';import { execFileSync } from 'node:child_process';
import { validateCasting,mergeCasting } from '../scripts/lib/casting-file.mjs';
import { extractImages,isBlocked } from '../scripts/lib/source-images.mjs';
const head={mt20id:'PF123',roles:['막심','댄버스'],auto:'melon'};
const row={date:'2026-11-24',time:'19:30',cast:['테이','옥주현']};
test('잘못된 날짜·시간·중복·빈 배역 거부',()=>{
 for(const rows of [[{...row,date:'2026-02-30'}],[{...row,time:'25:00'}],[row,row],[{...row,cast:['테이']}],[]])assert.throws(()=>validateCasting(head,rows));
});
test('배역 순서가 달라도 기존 기간 유지 및 동일 회차 갱신',()=>{
 const current={auto:'ticketlink',roles:['댄버스','막심'],shows:[{...row,cast:['신영숙','김우형']},{...row,date:'2026-11-25',cast:['신영숙','김우형']}]};
 const rows=mergeCasting(head,[row],current);assert.equal(rows.length,2);assert.deepEqual(rows[0].cast,row.cast);assert.deepEqual(rows[1].cast,['김우형','신영숙']);
});
test('수동 검증 및 다른 배역 구조 보호',()=>{
 assert.throws(()=>mergeCasting(head,[row],{roles:head.roles,shows:[row]}));
 assert.throws(()=>mergeCasting(head,[row],{auto:'melon',roles:['다른배역'],shows:[row]}));
});
test('클립서비스 상세 영역만 추출·중복 제거·상대경로 해석',()=>{
 const h='<img src="/logo.png"><dl id="jsDetails"><img src="/cast.jpg"><img src="/cast.jpg"></dl><img src="/unrelated.jpg">';
 assert.deepEqual(extractImages(h,'https://ticket.clipservice.co.kr/detail'),['https://ticket.clipservice.co.kr/cast.jpg']);
 assert.equal(isBlocked('비정상적인 접근으로 일시적으로 서비스 접속이 제한'),true);
});
test('멜론 상품 한 개 실패해도 다른 상품의 캐스팅 저장',async()=>{
 const root=await mkdtemp(join(tmpdir(),'casting-test-'));
 try {
  await mkdir(join(root,'scripts/lib'),{recursive:true});await mkdir(join(root,'data/casting'),{recursive:true});
  await mkdir(join(root,'src'),{recursive:true});
  for(const file of ['scripts/fetch-melon.mjs','scripts/lib/casting-file.mjs','src/show-filter.js'])await copyFile(new URL('../'+file,import.meta.url),join(root,file));
  await writeFile(join(root,'config.json'),JSON.stringify({melonProdIds:{PF123:['213527','213480']}}));
  await writeFile(join(root,'data/shows.json'),JSON.stringify({shows:[{id:'PF123',title:'엘리자벳',from:'2099-01-01',to:'2099-01-31',seats:350,large:false,links:[]}]}));
  await writeFile(join(root,'mock.mjs'),`globalThis.setTimeout=(fn,ms)=>{queueMicrotask(fn);return 0;};globalThis.fetch=async url=>{if(new URL(url).searchParams.get('prodId')==='213527')throw new Error('failed');return {ok:true,json:async()=>({code:'0000',roleList:[{roleName:'토드',orderNo:1}],itemList:[{perfDay:'20990101',perfTime:'1930',casting:{artistRoleList:[{roleName:'토드',artistName:'김준수'}]}}]})};};`);
  execFileSync(process.execPath,['--import',join(root,'mock.mjs'),join(root,'scripts/fetch-melon.mjs')],{stdio:'pipe'});
  const saved=JSON.parse(await readFile(join(root,'data/casting/PF123.json'),'utf8'));assert.equal(saved.shows.length,1);assert.deepEqual(saved.shows[0].cast,['김준수']);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('새 작업 환경에서 상세 이미지 자동 다운로드·상태 저장',async()=>{
 const root=await mkdtemp(join(tmpdir(),'images-test-'));
 try {
  await mkdir(join(root,'scripts/lib'),{recursive:true});await mkdir(join(root,'data'),{recursive:true});
  await mkdir(join(root,'src'),{recursive:true});
  for(const file of ['scripts/fetch-casting-images.mjs','scripts/lib/source-images.mjs','src/show-filter.js'])await copyFile(new URL('../'+file,import.meta.url),join(root,file));
  await writeFile(join(root,'config.json'),'{}');
  await writeFile(join(root,'data/shows.json'),JSON.stringify({shows:[{id:'PF123',title:'공연',to:'2099-01-31',seats:300,large:false,links:[{url:'https://ticket.clipservice.co.kr/detail'}]}]}));
  await writeFile(join(root,'mock.mjs'),`globalThis.setTimeout=(fn,ms)=>{queueMicrotask(fn);return 0;};globalThis.fetch=async url=>({ok:true,url,headers:{get:()=>url.endsWith('.jpg')?'image/jpeg':'text/html'},text:async()=>'<dl id="jsDetails"><img src="/cast.jpg"></dl>',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});`);
  execFileSync(process.execPath,['--import',join(root,'mock.mjs'),join(root,'scripts/fetch-casting-images.mjs')],{stdio:'pipe'});
  const manifest=JSON.parse(await readFile(join(root,'data/casting/image-sources.json'),'utf8'));assert.equal(manifest.shows.PF123.images.length,1);assert.equal(manifest.shows.PF123.status,'images_need_extraction');assert.equal(manifest.shows.PF123.images[0].changed,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
