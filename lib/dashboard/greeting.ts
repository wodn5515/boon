/**
 * 메인 대시보드 인사말 이름 헬퍼 (결정 로그 011 §C-1).
 *
 * 회귀 시드 (PR #6 review §):
 *   - 이전 `app/(authenticated)/page.tsx::pickGreetingName` 는 `email.slice(0, at)` 방식.
 *     `at = email.indexOf("@")` 가 -1 일 때 `at <= 0` 분기로 빠져 email 원문이 그대로 노출.
 *     `pickGreetingName({email: "noatsign"})` → "noatsign" — 회상 노트 톤(PRD §2) 위배 + PII 무방비.
 *
 * 본 모듈은 그 분기를 명시적으로 fallback 처리한다.
 *   1. user null → "친구"
 *   2. email null / 빈 문자열 → "친구"
 *   3. `@` 없는 이메일 / username 비어있는 형태("@boon.test") → "친구"
 *   4. 정상 이메일 → `@` 앞부분
 *
 * 호출자(app/(authenticated)/page.tsx) 는 본 함수를 import 해 단일 진실 원천으로 사용한다.
 *
 * 디자이너 위임 결정 (앞 슬라이스 결정 유지):
 *   - users 테이블에 별도 `display_name` 컬럼이 V1 엔티티 정의에 없다 (PRD §4).
 *     이메일 username (`@` 앞부분) 을 보여주면 보통 자기 별명과 가깝다.
 *   - 이메일 username 이 너무 길거나 숫자 잔뜩이면 그냥 그대로 노출 (가공 X) — V1 단순함 우선.
 */

/** 본 헬퍼의 fallback 카피. 회상 노트 톤상 "친구" 가 자연스럽다. */
const GREETING_FALLBACK = "친구";

export function pickGreetingName(
  user: { email: string | null } | null,
): string {
  const email = user?.email;
  if (!email) return GREETING_FALLBACK;
  const at = email.indexOf("@");
  // `@` 가 없거나 username 이 빈 경우 → fallback.
  if (at <= 0) return GREETING_FALLBACK;
  return email.slice(0, at);
}
