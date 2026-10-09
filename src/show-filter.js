// 공개·수집 범위와 대극장 분류를 분리한다.
export const MIN_SEATS = 300;
export const LARGE_SEATS = 500;
const FILTER_KEY = 'musical-site:large-only';
export function isEligibleShow(show, minSeats = MIN_SEATS) {
  if (show.child === 'Y' || show.excluded === true) return false;
  if (show.seats == null) return show.large === true; // 좌석 수 없는 기존 대극장 수동 자료 호환
  const seats = Number(show.seats);
  return Number.isFinite(seats) && seats >= minSeats;
}
export function readLargeOnly(storage) {
  try { return storage.getItem(FILTER_KEY) === 'true'; } catch { return false; }
}
export function saveLargeOnly(storage, enabled) {
  try { storage.setItem(FILTER_KEY, String(enabled)); return true; } catch { return false; }
}
