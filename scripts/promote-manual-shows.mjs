// 직접 넣은 작품(shows.manual.json)이 KOPIS에 올라오면 임시 번호 기록을 KOPIS 번호로 옮긴다.
// 매일 KOPIS 수집 바로 뒤에 돈다. 옮길 것이 없으면 아무 파일도 건드리지 않는다.
import { promoteManualShows } from './lib/promote-manual.mjs';
const { aliases, log } = await promoteManualShows(new URL('../', import.meta.url));
for (const line of log) console.log(line);
console.log(`직접 넣은 작품 연결 ${aliases.size}건${log.length ? '' : ' · 옮길 기록 없음'}`);
