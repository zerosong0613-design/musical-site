import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchNews} from '../scripts/lib/naver-news.mjs';
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
test('오류 응답을 검색 성공으로 기록하지 않는다',async()=>{
 await assert.rejects(searchNews('뮤지컬',{},async()=>({json:async()=>({error:{errorCode:'200'}})})),/응답 형식/);
 await assert.rejects(searchNews('뮤지컬',{},async()=>{throw Error('HTTP 401');}),/HTTP 401/);
 assert.deepEqual(await searchNews('뮤지컬',{},async()=>({json:async()=>({items:[]})})),[]);
});
