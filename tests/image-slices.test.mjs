import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slicePlan } from '../scripts/lib/image-slices.mjs';

test('짧은 이미지는 자르지 않는다', () => {
  assert.deepEqual(slicePlan(1000, 1548), [{ top: 0, height: 1548 }]);
  assert.deepEqual(slicePlan(1000, 2200), [{ top: 0, height: 2200 }]);
});

test('긴 이미지는 빈틈 없이 겹쳐서 끝까지 덮는다', () => {
  const width = 1120, height = 20016;
  const plan = slicePlan(width, height);
  assert.equal(plan[0].top, 0);
  assert.equal(plan.at(-1).top + plan.at(-1).height, height);
  for (const s of plan) assert.equal(s.height, width * 2);
  for (let i = 1; i < plan.length; i++) {
    const overlap = plan[i - 1].top + plan[i - 1].height - plan[i].top;
    assert.ok(overlap >= Math.round(width * 2 * 0.12) - 1, `조각 ${i} 겹침 ${overlap}`);
  }
});

test('상한보다 긴 이미지는 중단한다', () => {
  assert.throws(() => slicePlan(500, 60000), /너무 깁니다/);
});
