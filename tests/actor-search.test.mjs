import test from 'node:test';
import assert from 'node:assert/strict';
import { actorMatch, initialActorPicks } from '../src/actor-search.js';
import { filterShows } from '../src/casting.js';
const casting = {roles:['주연','상대역'],shows:[
 {date:'2026-10-08',time:'19:30',cast:['조승우','김수현']},
 {date:'2026-10-10',time:'14:00',cast:['조승우','박소연']},
 {date:'2026-10-11',time:'19:00',cast:['김준수','박소연']},
]};
const now = Date.parse('2026-10-09T17:00:00+09:00');
test('확보한 회차 및 목록 출연진에서 정확한 배우 이름을 찾는다', () => {
 assert.deepEqual(actorMatch({cast:'조승우, 김준수'}, casting, '조승우', now), {matched:true,count:1,hasSchedule:true});
 assert.deepEqual(actorMatch({cast:'조승우, 김준수'}, null, '조승우', now), {matched:true,count:0,hasSchedule:false});
 assert.equal(actorMatch({cast:'김준수정'}, null, '김준수', now).matched,false);
 assert.equal(actorMatch({cast:'조승우, 김준수'},casting,'승우',now).matched,false);
 assert.equal(actorMatch({cast:'조승우'},null,'조승우.*',now).matched,false);
 assert.equal(actorMatch({cast:''},casting,'김수현',now).count,0);
});
test('배우 검색 링크가 배우 선택과 남은 회차 필터로 이어진다', () => {
 const state={pick:initialActorPicks(casting,'조승우'),days:new Set(),includePast:false};
 assert.deepEqual(state.pick,['조승우',null]);
 assert.deepEqual(filterShows(casting.shows,state,now),[casting.shows[1]]);
 // 표에 없는 배우를 링크로 요청했을 때 다른 배우의 회차를 보여주지 않는다.
 assert.equal(filterShows(casting.shows,{...state,pick:[null,null],actor:'없는 배우'},now).length,0);
});
test('동일 배우가 여러 배역에 있으면 배역 AND 대신 배우 회차를 찾는다', () => {
 const multiple={roles:['A','B'],shows:[
 {date:'2026-10-10',time:'14:00',cast:['조승우','배우B']},
 {date:'2026-10-11',time:'19:00',cast:['배우A','조승우']},
 ]};
 const pick=initialActorPicks(multiple,'조승우');
 assert.deepEqual(pick,[null,null]);
 assert.equal(filterShows(multiple.shows,{pick,actor:'조승우',days:new Set(),includePast:false},now).length,2);
});
