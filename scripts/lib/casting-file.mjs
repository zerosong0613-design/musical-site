// data/casting/{mt20id}.json 쓰기와 index.json 재생성. 수동 변환·자동 수집이 함께 쓴다.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const OUT = new URL('../../data/casting/', import.meta.url);

// head: { mt20id, title, year, roles, source, checkedAt }
export async function writeCasting(head, shows, firstShow = {}) {
  const json = JSON.stringify(head, null, 2).replace(/\n}$/, '') +
    ',\n  "shows": [\n' + shows.map(s => '    ' + JSON.stringify(s)).join(',\n') + '\n  ],\n' +
    '  "firstShow": ' + JSON.stringify(firstShow) + '\n}\n';
  await writeFile(new URL(`${head.mt20id}.json`, OUT), json);
}

export async function rebuildIndex() {
  const index = [];
  for (const f of (await readdir(OUT)).filter(f => /^PF\w+\.json$/.test(f))) {
    const c = JSON.parse(await readFile(new URL(f, OUT), 'utf8'));
    index.push({ mt20id: c.mt20id, title: c.title, from: c.shows[0]?.date, to: c.shows.at(-1)?.date, checkedAt: c.checkedAt });
  }
  await writeFile(new URL('index.json', OUT), JSON.stringify(index, null, 2) + '\n');
}
