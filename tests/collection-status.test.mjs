import test from 'node:test';import assert from 'node:assert/strict';
import {classifyCollection as classify} from '../scripts/lib/collection-status.mjs';
const base={show:{id:'PF1',title:'작품'},today:'2026-10-09'};
test('대상 제외는 자료 미등록과 구분한다',()=>assert.equal(classify({...base,excluded:{title:'스타크로스드',reason:'연극'}}).status,'excluded'));
test('접근 실패를 표 없음으로 표시하지 않는다',()=>{
 for(const status of ['blocked','fetch_failed','invalid_product'])assert.notEqual(classify({...base,imageRecord:{pages:[{status}]},audit:{result:'no_schedule_in_checked_page'}}).status,'not_found_in_checked_page');
});
test('미확인·일반 이미지·확인된 표·확보한 회차를 구분한다',()=>{
 assert.equal(classify(base).status,'unverified');
 assert.equal(classify({...base,imageRecord:{images:[{}]}}).status,'pending_extraction');
 assert.equal(classify({...base,audit:{result:'no_schedule_in_checked_page'}}).status,'not_found_in_checked_page');
 const casting={checkedAt:'2026-10-08',shows:[{date:'2026-10-10'}]};
 assert.equal(classify({...base,casting,imageRecord:{pages:[{status:'blocked'}]}}).status,'collected');
 assert.equal(classify({...base,casting:{shows:[{date:'2026-10-01'}]}}).status,'coverage_expired');
});
import {pageProblem,imageCollectionStatus} from '../scripts/lib/source-images.mjs';
test('HTTP 200 오류 본문과 이미지 요청 실패를 정상 조회와 구분한다',()=>{
 assert.equal(pageProblem('<script>alert("상품정보가 올바르지 않습니다.");</script>'),'invalid_product');
 assert.equal(pageProblem('Restricted access'),'blocked');
 assert.equal(imageCollectionStatus({images:[],pages:[{status:'image_fetch_failed'}]}),'fetch_failed');
 assert.equal(imageCollectionStatus({images:[],pages:[{status:'no_images'}]}),'no_images');
});
