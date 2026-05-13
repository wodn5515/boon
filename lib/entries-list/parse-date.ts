/**
 * `/entries` URL searchParams 의 from/to 날짜 파싱 — semantic validation (결정 로그 011 §B-2).
 *
 * 회귀 시드 (PR #7 🟢 #1 + PR #9 review §):
 *   - 이전 `app/(authenticated)/entries/page.tsx::parseDate` 는 `/^\d{4}-\d{2}-\d{2}$/` 형식
 *     정규식만 검사. `2026-13-45`, `2026-02-30` 같이 형식은 맞지만 의미상 존재할 수 없는
 *     날짜가 그대로 listEntriesFiltered → drizzle SQL `received_date >= ${raw}` 비교에 흘러가
 *     Postgres 가 `invalid input syntax for type date` 로 throw → Next.js Server Component 가
 *     500 / error.tsx 로 빠진다.
 *
 * 본 모듈은 그 검증을 lib 단으로 끌어올린 **단일 진실 원천**.
 *   1. 형식 검사 — `YYYY-MM-DD` 패턴.
 *   2. semantic 검사 — `new Date(raw + "T00:00:00Z")` 가 finite 인지.
 *   3. round-trip 비교 — `2026-02-30` 처럼 Date 가 자동 normalize 해 `2026-03-02` 가 되는 입력
 *      도 거부 (round-trip 결과가 원문과 다르면 invalid).
 *
 * 호출자(app/(authenticated)/entries/page.tsx) 는 본 함수에 위임해 `parseDate(raw)` 를 단일
 * 진실 원천화한다.
 */

/**
 * `YYYY-MM-DD` 형식 + 실제 존재하는 날짜만 통과시킨다. invalid 면 빈 문자열.
 *
 * @param raw URL searchParam 의 raw 문자열.
 * @returns 정상 날짜는 원문, invalid 는 빈 문자열.
 */
export function parseEntriesDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  // UTC 기준으로 Date 를 만들어 호스트 TZ 영향 없이 round-trip 비교.
  const t = new Date(`${raw}T00:00:00Z`).getTime();
  if (!Number.isFinite(t)) return "";
  // round-trip — 2026-02-30 → 2026-03-02 처럼 normalize 된 경우 거부.
  const iso = new Date(t).toISOString().slice(0, 10);
  return iso === raw ? raw : "";
}
