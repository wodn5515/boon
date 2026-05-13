/**
 * PostgreSQL `LIKE` / `ILIKE` 패턴의 와일드카드 문자(`%`, `_`, `\`)를 사용자 입력에서 escape.
 *
 * 결정 로그 008 §J — `lib/friends/queries.ts` 의 inline `escapeLike` (PR #3 sfx 🟢 #8)
 * 와 동일 함수를 `lib/entries-list/queries.ts` 가 재요구한다. 같은 파일에 두 번 복제하는
 * 부채를 피해 공용 util 로 추출.
 *
 * 규약:
 *   - 백슬래시 `\` → `\\`
 *   - 퍼센트 `%`  → `\%`
 *   - 언더스코어 `_` → `\_`
 *   - 그 외 문자(한글·이모지·숫자·공백 포함)는 그대로
 *   - 빈 문자열은 빈 문자열
 *
 * drizzle 의 파라미터 바인딩은 SQL injection 으로부터 보호하지만, 와일드카드는 LIKE 의미상
 * 그대로 해석돼 "검색어로 `%` 입력 시 모두 매칭" 같은 UX 의도와 다른 동작을 유발한다.
 * 본 함수가 그 의미 누수를 막는다.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}
