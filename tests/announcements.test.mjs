import test from 'node:test';import assert from 'node:assert/strict';
import {openingDetails,makeAnnouncement,applyAnnouncements,matchShow,officialUrl,plain} from '../scripts/lib/announcements.mjs';
import {mergeOpenings,castingLink,mobileVendorUrl} from '../src/announcement-links.js';
import {filterShows,mountCasting} from '../src/casting.js';
const show={id:'PFX2026SWEENEY',title:'스위니토드',venue:'디큐브 링크아트센터'};
test('캐스팅 화면에서 공식 이미지 원본을 직접 열 수 있다',()=>{
 const el={innerHTML:'',addEventListener(){}};
 const image='https://commonfile.clipservice.co.kr/cast.jpg';
 mountCasting(el,{roles:['앨리'],shows:[{date:'2026-11-01',time:'19:30',cast:['김수하']}],sourceImage:image,source:'공식 표',checkedAt:'2026-10-09'},{});
 assert.ok(el.innerHTML.includes(`href="${image}"`));
 assert.ok(el.innerHTML.includes('캐스팅표 원본 보기'));
});
test('모바일 상세 링크가 작품 번호를 보존하며 PC·다른 도메인은 유지한다',()=>{
 for(const id of ['79219','79229','79473']) {
  const pc=`https://ticket.clipservice.co.kr/Clipservice/Ticket/ShowDetail?playNum=${id}`;
  assert.equal(mobileVendorUrl(pc,true),`https://m-ticket.clipservice.co.kr/Play/PlayDetail?playNum=${id}`);
  assert.equal(mobileVendorUrl(pc,false),pc);
 }
 const image='https://commonfile.clipservice.co.kr/cast.jpg';
 assert.equal(mobileVendorUrl(image,true),image);
 assert.equal(mobileVendorUrl('https://ticket.clipservice.co.kr.evil.example/Clipservice/Ticket/ShowDetail?playNum=79219',true),'https://ticket.clipservice.co.kr.evil.example/Clipservice/Ticket/ShowDetail?playNum=79219');
 assert.equal(mobileVendorUrl('https://ticket.yes24.com/New/Notice/NoticeMain.aspx#id=123',true),'https://m.ticket.yes24.com/Notice/Detail.aspx?bid=123');
});
const body='스위니토드 1차 티켓오픈 일반예매 : 2026년 10월 13일(화) 오전 11시 1차 티켓오픈 공연기간 : 2026년 12월 4일(금) ~ 2026년 12월 20일(일) 캐스팅 스케줄 안내';
test('한 공지에서 오픈 시각/판매 기간과 캐스팅 공지를 각각 반영하고 재수집 중복 제거',()=>{
 const a=makeAnnouncement({url:'https://www.ticketlink.co.kr/help/notice/66160',text:body,source:'티켓링크'},show);
 assert.equal(a.status,'verified');assert.equal(a.hasSchedule,true);
 assert.deepEqual(a.openings,[{at:'2026-10-13 11:00',presale:false}]);assert.equal(a.performanceFrom,'2026-12-04');assert.equal(a.performanceTo,'2026-12-20');
 const first=applyAnnouncements([a],[],[]);const second=applyAnnouncements([a],first.openings,first.notices);
 assert.equal(second.openings.length,1);assert.equal(second.notices.length,1);assert.equal(second.openings[0].announcementIds[0],second.notices[0].id);
});
test('게시 시각/공연 시간은 오픈으로 오인하지 않고 불완전한 연도·잘못된 날짜 거부',()=>{
 assert.deepEqual(openingDetails('2026년 10월 8일 기사. 공연 2026년 12월 4일 오후 7시 30분').openings,[]);
 assert.deepEqual(openingDetails('티켓오픈 10월 13일 오전 11시').openings,[]);
 assert.deepEqual(openingDetails('티켓오픈 2026년 2월 30일 오후 2시').openings,[]);
 assert.equal(openingDetails('티켓오픈 2026년 10월 13일 오후 2시 30분').openings[0].at,'2026-10-13 14:30');
});
test('출연진 발표는 회차별 스케줄로 만들지 않고 비공식 공지는 확인 대기',()=>{
 const roster=makeAnnouncement({url:'https://ticket.melon.com/notice',text:'스위니토드 캐스팅 공개 조승우 전미도'},show);
 assert.equal(roster.kind,'roster');assert.equal(roster.hasSchedule,false);assert.equal(roster.openings.length,0);
 const community=makeAnnouncement({url:'https://gall.dcinside.com/mini/board/view/?id=theatergoing&no=1',text:body},show);
 assert.equal(community.status,'review_needed');assert.equal(applyAnnouncements([community],[],[]).openings.length,0);
 assert.equal(officialUrl('https://ticketlink.co.kr.evil.example/notice'),false);
 assert.equal(officialUrl('javascript:alert(1)'),false);
});
test('같은 제목 지방공연/이전 시즌 혼동 방지',()=>{
 const shows=[{id:'PF1',title:'빨래 [수원]',venue:'수원문화예술회관'},{id:'PF2',title:'빨래 [하남]',venue:'하남문화예술회관'}];
 assert.equal(matchShow('빨래 캐스팅 공개',shows),null);assert.equal(matchShow('빨래 하남 캐스팅 공개',shows).id,'PF2');
});
test('선예매/일반예매·예매처 구분 및 수동 내용 보호',()=>{
 const a=makeAnnouncement({url:'https://nol.yanolja.com/ticket/products/26014509',text:body,verified:true},show);
 const original={id:'nol-26014509',mt20id:show.id,at:'2026-10-13 11:00',vendor:'NOL 티켓',title:'원래 제목',url:a.url};
 const combined=applyAnnouncements([a],[original],[]);assert.equal(combined.openings.length,1);assert.equal(combined.openings[0].id,original.id);
 const manual={...original,title:'수동 확인',performanceFrom:'2026-12-05'};
 assert.equal(mergeOpenings(combined.openings,[manual])[0].title,'수동 확인');
 assert.equal(applyAnnouncements([a],[original],[],[manual]).openings[0].performanceFrom,undefined);
 const multi=openingDetails('선예매 : 2026년 10월 12일 오후 2시 일반예매 : 2026년 10월 13일 오전 11시');assert.equal(multi.openings.length,2);
});
test('나중에 캐스팅표가 생기면 기간 링크가 생기고 실제 회차도 판매기간으로 제한',()=>{
 const o={mt20id:show.id,performanceFrom:'2026-12-04',performanceTo:'2026-12-20'};
 assert.equal(castingLink(o,new Map()),null);
 const index=new Map([[show.id,{from:'2026-12-04',to:'2026-12-20'}]]);
 assert.equal(castingLink(o,index),'#/show/PFX2026SWEENEY?from=2026-12-04&to=2026-12-20');
 assert.equal(castingLink({...o,performanceFrom:'2027-01-01',performanceTo:'2027-01-31'},index),null);
 const rows=['2026-12-03','2026-12-04','2026-12-20','2026-12-21'].map(date=>({date,time:'19:30',cast:['조승우']}));
 assert.equal(filterShows(rows,{includePast:true,from:o.performanceFrom,to:o.performanceTo,days:new Set(),pick:[null]},0).length,2);
});
test('HTML의 스크립트/태그 제거와 한글 날짜 텍스트 보존',()=>{
 assert.equal(plain('<script>티켓오픈 2026년 1월 1일</script><p>캐스팅&nbsp;공개</p>'),'캐스팅 공개');
});

test('추후 공지 문구를 스케줄 공개로 잘못 등록하지 않는다',()=>{
 const a=makeAnnouncement({url:'https://www.ticketlink.co.kr/help/notice/1',text:'스위니토드 티켓오픈 안내. 캐스팅 스케줄은 별도 공지됩니다. [캐스팅] - 스위니토드: 조승우'},show);
 assert.equal(a.hasSchedule,false);assert.equal(a.kind,'roster');
});

test('작품명 꺾쇠를 HTML 태그로 지우지 않는다',()=>{
 assert.equal(matchShow(plain('뮤지컬 <곤 투모로우> 티켓오픈'),[{id:'PF1',title:'곤 투모로우 [대학로]',venue:'광림'}],'PF1').id,'PF1');
});

