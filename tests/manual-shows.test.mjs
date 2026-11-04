import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchManualShow, resolveShows, canonicalId } from '../src/manual-shows.js';
import { promoteManualShows, mergeCastingFiles } from '../scripts/lib/promote-manual.mjs';

const manual = { id: 'PFX2026SWEENEY', matchTitle: '스위니토드', title: '스위니토드', from: '2026-12-04', to: '2027-05-02' };
const kopis = { id: 'PF303043', title: '스위니토드 (SWEENEY TODD)', from: '2026-12-04', to: '2027-05-02' };

test('직접 넣은 작품은 제목이 맞는 KOPIS 작품과 짝을 짓고 목록에서 빠진다', () => {
  assert.equal(matchManualShow(manual, [kopis])?.id, 'PF303043');
  const { shows, aliases } = resolveShows([kopis], [manual]);
  assert.deepEqual(shows.map(s => s.id), ['PF303043']);
  assert.equal(canonicalId('PFX2026SWEENEY', aliases), 'PF303043');
  assert.equal(canonicalId('PF999', aliases), 'PF999');
});

test('KOPIS에 아직 없으면 직접 넣은 작품을 그대로 보여 준다', () => {
  const { shows, aliases } = resolveShows([{ id: 'PF1', title: '레미제라블' }], [manual]);
  assert.deepEqual(shows.map(s => s.id), ['PF1', 'PFX2026SWEENEY']);
  assert.equal(aliases.size, 0);
});

test('같은 제목이 여러 편이면 기간이 겹치는 작품을 고르고, 애매하면 짝짓지 않는다', () => {
  const old = { ...kopis, id: 'PF100', from: '2024-01-01', to: '2024-03-01' };
  assert.equal(matchManualShow(manual, [old, kopis])?.id, 'PF303043');
  const other = { ...old, id: 'PF101' };
  assert.equal(matchManualShow(manual, [old, other]), null);
});

test('예전에 옮긴 짝은 제목이 달라져도 이어 쓴다', () => {
  const renamed = { ...kopis, title: 'Sweeney Todd' };
  const { aliases } = resolveShows([renamed], [manual], { PFX2026SWEENEY: 'PF303043' });
  assert.equal(aliases.get('PFX2026SWEENEY'), 'PF303043');
});

test('캐스팅 병합: KOPIS 번호 쪽 회차가 우선이고 배역 순서를 맞춘다', () => {
  const source = { roles: ['토드', '러빗'], shows: [{ date: '2026-12-04', time: '19:30', cast: ['조승우', '전미도'] }, { date: '2026-12-05', time: '14:00', cast: ['강필석', '김소현'] }], sources: ['공식 이미지'], firstShow: {} };
  const target = { auto: 'ticketlink', roles: ['러빗', '토드'], shows: [{ date: '2026-12-05', time: '14:00', cast: ['박지연', '김주택'] }], source: '티켓링크', firstShow: {} };
  const merged = mergeCastingFiles(target, source);
  assert.equal(merged.auto, 'ticketlink');
  assert.deepEqual(merged.shows.map(s => s.cast), [['전미도', '조승우'], ['박지연', '김주택']]);
  assert.deepEqual(merged.sources, ['공식 이미지', '티켓링크']);
  assert.equal(mergeCastingFiles({ ...target, roles: ['토드', '조안나'] }, source), null);
});

test('승격: 임시 번호 기록을 KOPIS 번호로 옮기고, 두 번 돌려도 바뀌지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'promote-'));
  try {
    const root = pathToFileURL(dir + '/');
    await mkdir(join(dir, 'data/casting/src'), { recursive: true });
    const put = (p, v) => writeFile(join(dir, p), typeof v === 'string' ? v : JSON.stringify(v, null, 1) + '\n');
    await put('data/shows.json', { shows: [kopis] });
    await put('data/shows.manual.json', [manual]);
    await put('data/casting/PFX2026SWEENEY.json', { mt20id: 'PFX2026SWEENEY', title: '스위니토드', roles: ['토드', '러빗'], shows: [{ date: '2026-12-04', time: '19:30', cast: ['조승우', '전미도'] }], checkedAt: '2026-10-08' });
    await put('data/casting/PF1.json', { mt20id: 'PF1', title: '다른 작품', roles: ['A'], shows: [{ date: '2026-12-01', time: '19:30', cast: ['가'] }] });
    await put('data/casting/src/PFX2026SWEENEY.txt', '# mt20id: PFX2026SWEENEY\n# title: 스위니토드\n');
    await put('data/notices.json', [{ id: 'n1', mt20id: 'PFX2026SWEENEY' }, { id: 'n2', mt20id: 'PF1' }]);
    await put('data/announcements.json', [{ id: 'a1', mt20id: 'PFX2026SWEENEY', images: [{ mt20id: 'PFX2026SWEENEY' }] }]);
    await put('data/casting/events.json', [{ mt20id: 'PFX2026SWEENEY', kind: 'new' }]);
    await put('data/casting/image-sources.json', { shows: { PFX2026SWEENEY: { title: '스위니토드', pages: [] } } });

    const first = await promoteManualShows(root);
    assert.ok(first.log.length > 0);
    const read = async p => JSON.parse(await readFile(join(dir, p), 'utf8'));
    const casting = await read('data/casting/PF303043.json');
    assert.equal(casting.mt20id, 'PF303043');
    assert.equal(casting.title, '스위니토드 (SWEENEY TODD)');
    assert.equal(casting.shows.length, 1);
    const files = await readdir(join(dir, 'data/casting'));
    assert.ok(!files.includes('PFX2026SWEENEY.json'));
    assert.match(await readFile(join(dir, 'data/casting/src/PF303043.txt'), 'utf8'), /^# mt20id: PF303043$/m);
    assert.deepEqual((await read('data/notices.json')).map(n => n.mt20id), ['PF303043', 'PF1']);
    const ann = await read('data/announcements.json');
    assert.equal(ann[0].mt20id, 'PF303043');
    assert.equal(ann[0].images[0].mt20id, 'PF303043');
    assert.equal((await read('data/casting/events.json'))[0].mt20id, 'PF303043');
    assert.deepEqual(Object.keys((await read('data/casting/image-sources.json')).shows), ['PF303043']);
    assert.deepEqual((await read('data/casting/index.json')).map(c => c.mt20id), ['PF1', 'PF303043']);
    assert.deepEqual(await read('data/show-aliases.json'), { PFX2026SWEENEY: 'PF303043' });

    const snapshot = await Promise.all(['data/notices.json', 'data/casting/index.json', 'data/show-aliases.json'].map(p => readFile(join(dir, p), 'utf8')));
    const second = await promoteManualShows(root);
    assert.deepEqual(second.log, []);
    assert.deepEqual(await Promise.all(['data/notices.json', 'data/casting/index.json', 'data/show-aliases.json'].map(p => readFile(join(dir, p), 'utf8'))), snapshot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
