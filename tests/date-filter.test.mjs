import test from 'node:test';import assert from 'node:assert/strict';
import {validPeriod,overlapsPeriod,periodSessions,showFilterLink} from '../src/date-filter.js';
test('공연기간과 하루라도 겹치는 작품 및 같은 날짜를 포함한다',()=>{
 const s={from:'2026-10-10',to:'2026-11-01'};
 assert.ok(overlapsPeriod(s,'2026-11-01','2026-11-01'));
 assert.ok(overlapsPeriod(s,'2026-10-01','2026-10-10'));
 assert.equal(overlapsPeriod(s,'2026-11-02','2026-11-05'),false);
 assert.equal(validPeriod('2026-02-30','2026-03-02'),false);
 assert.equal(validPeriod('2026-11-02','2026-11-01'),false);
 assert.ok(overlapsPeriod(s,'',''));
});
test('선택기간의 확보된 회차를 배우와 교차하고 지난 회차는 제외한다',()=>{
 const c={shows:[{date:'2026-10-10',time:'14:00',cast:['조승우']},{date:'2026-10-10',time:'19:00',cast:['김준수']},{date:'2026-10-11',time:'14:00',cast:['조승우']}]};
 const now=Date.parse('2026-10-10T15:00:00+09:00');
 assert.equal(periodSessions(c,'2026-10-10','2026-10-11','',now),2);
 assert.equal(periodSessions(c,'2026-10-10','2026-10-11','조승우',now),1);
 assert.equal(periodSessions(c,'2026-10-12','2026-10-12','',now),0);
 assert.equal(periodSessions(null,'2026-10-10','2026-10-11'),null);
});
test('상세 링크에 기간과 배우 선택을 함께 전달한다',()=>{
 const q=new URLSearchParams(showFilterLink('PF1','조승우','2026-10-10','2026-10-11').split('?')[1]);
 assert.equal(q.get('actor'),'조승우');assert.equal(q.get('from'),'2026-10-10');assert.equal(q.get('to'),'2026-10-11');
 assert.equal(showFilterLink('PF1'),'#/show/PF1');
});
