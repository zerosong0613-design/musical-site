import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchNews,searchNaver,searchCandidate} from '../scripts/lib/naver-news.mjs';
test('API HUB 뉴스 요청은 새 인증 헤더와 날짜순 검색을 사용한다',async()=>{
 const items=[{title:'뮤지컬 공지',originallink:'https://example.com/news'}];
 const result=await searchNews('뮤지컬 티켓 오픈',{NAVER_CLIENT_ID:'test-id',NAVER_CLIENT_SECRET:'test-secret'},async(url,headers)=>{
  const u=new URL(url);
  assert.equal(u.origin,'https://naverapihub.apigw.ntruss.com');
  assert.equal(u.pathname,'/search/v1/news');
  assert.equal(u.searchParams.get('query'),'뮤지컬 티켓 오픈');
  assert.equal(u.searchParams.get('sort'),'date');
  assert.equal(u.searchParams.get('format'),'json');
  assert.deepEqual(headers,{'X-NCP-APIGW-API-KEY-ID':'test-id','X-NCP-APIGW-API-KEY':'test-secret'});
  assert.ok(!url.includes('test-secret'));
  return {json:async()=>({items})};
 });
 assert.deepEqual(result,items);
});
test('블로그는 날짜순, 웹문서는 지원하는 파라미터만 전송한다',async()=>{
 for(const kind of ['blog','webkr'])await searchNaver(kind,'뮤지컬',{},async(url)=>{
  const u=new URL(url);assert.equal(u.pathname,'/search/v1/'+kind);
  assert.equal(u.searchParams.get('sort'),kind==='blog'?'date':null);
  return {json:async()=>({items:[]})};
 });
});
test('블로그 날짜와 날짜 없는 웹문서를 구분하고 오래된 글·잘못된 링크를 제외한다',()=>{
 const now=Date.parse('2026-10-09T12:00:00+09:00');
 const item={title:'공지',link:'https://example.com/notice',postdate:'20261009'};
 assert.equal(searchCandidate(item,'blog',now).at,'2026-10-08T15:00:00.000Z');
 assert.equal(searchCandidate({...item,postdate:'20260901'},'blog',now),null);
 assert.equal(searchCandidate({...item,postdate:'invalid'},'blog',now),null);
 assert.equal(searchCandidate({...item,link:'javascript:alert(1)'},'webkr',now),null);
 assert.ok(!Object.hasOwn(searchCandidate(item,'webkr',now),'at'));
});
test('오류 응답을 검색 성공으로 기록하지 않는다',async()=>{
 await assert.rejects(searchNews('뮤지컬',{},async()=>({json:async()=>({error:{errorCode:'200'}})})),/응답 형식/);
 await assert.rejects(searchNews('뮤지컬',{},async()=>{throw Error('HTTP 401');}),/HTTP 401/);
 assert.deepEqual(await searchNews('뮤지컬',{},async()=>({json:async()=>({items:[]})})),[]);
});
