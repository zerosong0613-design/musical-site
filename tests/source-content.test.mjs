import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanMarkupText,isProductPage,sourceLinkLabel} from '../src/source-content.js';
import {makeAnnouncement,applyAnnouncements} from '../scripts/lib/announcements.mjs';
const show={id:'TEST',title:'시카고'};
test('아이콘 코드와 스크립트를 제거하고 작품명의 꺾쇠는 보존한다',()=>{
 assert.equal(cleanMarkupText('<div>뮤지컬 &lt;시카고&gt;</div><svg><path d="M0 0"/></svg><script>alert(1)</script> 변경 공지'),'뮤지컬 <시카고> 변경 공지');
 assert.equal(cleanMarkupText('장소 &lt;svg xmlns="http://www.w3.org/2000/svg" width="12"'),'장소');
});
test('상품페이지의 메뉴와 변경 규정은 캐스팅 변경 공지로 공개하지 않는다',()=>{
 const url='https://nol.yanolja.com/ticket/products/123';
 const a=makeAnnouncement({url,text:'시카고 캐스팅 상품상세 배우 변경 취소 및 환불규정',source:'네이버 웹문서'},show);
 assert.equal(a.status,'product_page');assert.equal(a.hasCasting,false);
 assert.equal(applyAnnouncements([a],[],[]).notices.length,0);
 assert.equal(sourceLinkLabel(url),'예매페이지');
 assert.equal(isProductPage('https://www.ticketlink.co.kr/help/notice/123'),false);
 const real=makeAnnouncement({url:'https://www.ticketlink.co.kr/help/notice/123',text:'시카고 캐스팅 변경 안내'},show);
 assert.equal(real.status,'verified');assert.equal(real.kind,'change');
});
test('상품페이지 링크가 있는 검증된 예매오픈은 유지한다',()=>{
 const a=makeAnnouncement({url:'https://nol.yanolja.com/ticket/products/123',text:'시카고 티켓 오픈',stub:true,openingAt:'2026-10-13 11:00'},show);
 assert.equal(a.status,'verified');assert.equal(applyAnnouncements([a],[],[]).openings.length,1);
});
