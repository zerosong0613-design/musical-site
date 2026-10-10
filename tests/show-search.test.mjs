import test from 'node:test';import assert from 'node:assert/strict';
import {matchesTitleVenue} from '../src/show-search.js';
test('공연명과 극장명은 부분 검색하고 띄어쓰기와 대소문자를 무시한다',()=>{
 const s={title:'스위니토드 [서울]',venue:'디큐브 링크아트센터'};
 assert.ok(matchesTitleVenue(s,'스위니 토드'));assert.ok(matchesTitleVenue(s,'링크아트'));assert.ok(matchesTitleVenue(s,''));
 assert.equal(matchesTitleVenue(s,'샤롯데'),false);
 assert.ok(matchesTitleVenue({title:'Chicago',venue:'LG아트센터'},'chicago'));
});
