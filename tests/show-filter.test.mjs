import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleShow, readLargeOnly, saveLargeOnly } from '../src/show-filter.js';

test('300석 기본 범위와 500석 대극장 필터를 구분한다', () => {
  for (const seats of [299, 300, 499, 500]) {
    const show = { seats, child: 'N', large: seats >= 500 };
    assert.equal(isEligibleShow(show), seats >= 300);
    assert.equal(isEligibleShow(show, 500), seats >= 500);
  }
  assert.equal(isEligibleShow({ seats: 400, large: false }), true);
  assert.equal(isEligibleShow({ seats: 1000, child: 'Y', large: true }), false);
  assert.equal(isEligibleShow({ seats: null, large: false }), false);
  assert.equal(isEligibleShow({ seats: 'unknown' }), false);
  assert.equal(isEligibleShow({ large: true }), true);
});

test('대극장 선택은 브라우저에 저장하며 차단된 저장소에서는 기본 전체 보기', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  assert.equal(readLargeOnly(storage), false);
  assert.equal(saveLargeOnly(storage, true), true);
  assert.equal(readLargeOnly(storage), true);
  saveLargeOnly(storage, false);
  assert.equal(readLargeOnly(storage), false);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(readLargeOnly(blocked), false);
  assert.equal(saveLargeOnly(blocked, true), false);
});
