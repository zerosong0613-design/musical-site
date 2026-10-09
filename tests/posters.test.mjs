import test from 'node:test';import assert from 'node:assert/strict';
import {posterFromPage,posterPages} from '../scripts/lib/poster-source.mjs';
test('작품이 일치하는 예매처 대표 포스터만 사용한다',()=>{
 const h='<meta content="뮤지컬 스위니토드 - 10주년" property="og:title"><meta property="og:image" content="https://ticketimage.interpark.com/Play/image/large/26/26014509_p.gif">';
 assert.ok(posterFromPage(h,'https://nol.yanolja.com/ticket/products/26014509',{title:'스위니토드'}));
 assert.equal(posterFromPage(h,'https://nol.yanolja.com/',{title:'빨래 [수원]'}),null);
 assert.equal(posterFromPage(h.replace('ticketimage.interpark.com','evil.example'),'https://nol.yanolja.com/',{title:'스위니토드'}),null);
 assert.equal(posterFromPage(h+' Restricted access','https://nol.yanolja.com/',{title:'스위니토드'}),null);
});
test('지역·기획 표기를 제외한 제목 일치 및 구 인터파크 주소 변환',()=>{
 const h='<meta property="og:title" content="뮤지컬 만천명월 격쟁을 허하라 - 화성"><meta property="og:image" content="https://ticketimage.interpark.com/poster.gif">';
 assert.ok(posterFromPage(h,'https://nol.yanolja.com/',{title:'HAC Choice, 만천명월 격쟁을 허하라 [화성]'}));
 assert.deepEqual(posterPages([{url:'http://ticket.interpark.com/Ticket/Goods/GoodsInfo.asp?GoodsCode=26013096'}]),['https://nol.yanolja.com/ticket/products/26013096']);
 assert.deepEqual(posterPages([{url:'https://ticket.interpark.com.evil.example/?GoodsCode=26013096'}]),[]);
});
