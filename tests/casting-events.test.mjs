import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffCasting } from '../scripts/lib/casting-file.mjs';

const head = { mt20id: 'PF000001', roles: ['A', 'B'] };
const show = (date, time, cast) => ({ date, time, cast });

test('처음 들어온 표는 남은 회차 구간을 공개로 기록', () => {
  const merged = [show('2026-10-01', '19:30', ['가', '나']), show('2026-10-20', '19:30', ['가', '다']), show('2026-10-21', '14:30', ['라', '나'])];
  assert.deepEqual(diffCasting(head, null, merged, '2026-10-08'), [{ kind: 'new', from: '2026-10-20', to: '2026-10-21', count: 2 }]);
});

test('새 회차는 추가 공개, 배우가 바뀐 회차는 변경으로 기록하고 지난 회차는 무시', () => {
  const current = { roles: ['B', 'A'], shows: [show('2026-10-01', '19:30', ['나', '가']), show('2026-10-20', '19:30', ['다', '가'])] };
  const merged = [show('2026-10-01', '19:30', ['바', '나']), show('2026-10-20', '19:30', ['가', '마']), show('2026-10-22', '19:30', ['가', '나'])];
  assert.deepEqual(diffCasting(head, current, merged, '2026-10-08'), [
    { kind: 'added', from: '2026-10-22', to: '2026-10-22', count: 1 },
    { kind: 'changed', changes: [{ date: '2026-10-20', time: '19:30', role: 'B', from: '다', to: '마' }] },
  ]);
});

test('변화가 없거나 배역 구성이 달라지면 기록하지 않는다', () => {
  const current = { roles: ['A', 'B'], shows: [show('2026-10-20', '19:30', ['가', '나'])] };
  assert.deepEqual(diffCasting(head, current, [show('2026-10-20', '19:30', ['가', '나'])], '2026-10-08'), []);
  assert.deepEqual(diffCasting({ ...head, roles: ['A', 'C'] }, current, [show('2026-10-20', '19:30', ['가', '나'])], '2026-10-08'), []);
});
