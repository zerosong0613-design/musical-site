// 캐스팅표가 비었거나 일부 구간만 있을 때, 네이버 검색의 캐스팅 일정으로 안내한다.
// 네이버 화면을 긁어 오지 않고 링크로만 보낸다(이용약관·원출처 존중). 빌드와 브라우저가 같이 쓴다.

export const naverCastingUrl = s => `https://search.naver.com/search.naver?query=${encodeURIComponent(`뮤지컬 ${s.title} 캐스팅 일정`)}`;

const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 무엇이 비었는지: none(표 없음) · expired(공개 회차가 모두 지남) · partial(공연은 이어지는데 표가 먼저 끝남)
export function castingGap(show, casting, today) {
  if (show.to && show.to < today) return null;
  const rows = casting?.shows ?? [];
  if (!rows.length) return { kind: 'none' };
  const last = rows.at(-1).date;
  if (last < today) return { kind: 'expired', last };
  if (show.to && last < show.to && !show.openrun) return { kind: 'partial', last };
  return null;
}

const MESSAGES = {
  none: () => '이 작품은 아직 회차별 캐스팅표를 모으지 못했어요. 네이버 검색의 캐스팅 일정에서 먼저 확인해 보세요.',
  expired: g => `${md(g.last)}까지 모은 캐스팅표는 모두 지난 회차예요. 이후 회차는 네이버 캐스팅 일정에서 확인해 보세요.`,
  partial: g => `여기엔 ${md(g.last)}까지의 캐스팅만 있어요. 그 뒤 회차가 공개됐는지는 네이버 캐스팅 일정에서 확인해 보세요.`,
};

// esc는 호출하는 쪽의 HTML 이스케이프 함수를 받는다.
export function castingGapHtml(show, gap, esc) {
  if (!gap) return '';
  return `<div class="casting-gap casting-gap-${gap.kind}" role="note">
      <p>${esc(MESSAGES[gap.kind](gap))}</p>
      <a class="btn" href="${esc(naverCastingUrl(show))}" target="_blank" rel="noopener">네이버에서 캐스팅 일정 보기 ↗</a>
    </div>`;
}
