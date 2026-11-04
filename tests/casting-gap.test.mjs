import test from 'node:test';
import assert from 'node:assert/strict';
import { castingGap, castingGapHtml, naverCastingUrl } from '../src/casting-gap.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = { title: '스위니토드 (SWEENEY TODD)', from: '2026-12-04', to: '2027-05-02' };
const rows = dates => ({ shows: dates.map(date => ({ date, time: '19:30', cast: ['가'] })) });

test('표가 없으면 none, 지난 회차뿐이면 expired, 공연보다 먼저 끝나면 partial', () => {
  assert.deepEqual(castingGap(show, null, '2026-11-04'), { kind: 'none' });
  assert.deepEqual(castingGap(show, rows(['2026-11-01']), '2026-11-04'), { kind: 'expired', last: '2026-11-01' });
  assert.deepEqual(castingGap(show, rows(['2026-12-04', '2026-12-20']), '2026-11-04'), { kind: 'partial', last: '2026-12-20' });
});
test('끝까지 공개됐거나, 오픈런이거나, 공연이 끝났으면 안내하지 않는다', () => {
  assert.equal(castingGap(show, rows(['2027-05-02']), '2026-11-04'), null);
  assert.equal(castingGap({ ...show, openrun: true }, rows(['2026-12-20']), '2026-11-04'), null);
  assert.equal(castingGap({ ...show, to: '2026-10-01' }, null, '2026-11-04'), null);
});
test('안내 문구와 네이버 링크', () => {
  const html = castingGapHtml(show, { kind: 'partial', last: '2026-12-20' }, esc);
  assert.match(html, /12\/20까지의 캐스팅만/);
  assert.ok(html.includes(esc(naverCastingUrl(show))));
  assert.equal(castingGapHtml(show, null, esc), '');
  assert.equal(new URL(naverCastingUrl(show)).searchParams.get('query'), '뮤지컬 스위니토드 (SWEENEY TODD) 캐스팅 일정');
});
