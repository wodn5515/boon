/**
 * `parseMemo` — FormData 의 `memo` 필드를 안전하게 trim 한다 (PR #5 🟢 #3 / 007 §H-3).
 *
 * 배경:
 *   - 006 §D 는 `memo NOT NULL` + 빈 문자열 허용 정책을 정했다. 빈 문자열 = "기록 없음" sentinel.
 *   - 그런데 entries Server Action 의 inline `parseMemo` 는 raw 그대로 돌려줘서 "   " (공백만)
 *     입력 시 DB 에 공백 row 가 저장됐다. UX 의도(디자이너 결정): "빈 메모" 와 "공백만 입력" 은
 *     같은 결과여야 한다.
 *
 * 결정 (007 §H-3 / test-writer §J-1):
 *   - `parseMemo(formData)` 는 trim 후 결과를 반환. "   " → "". 통상 입력의 앞뒤 공백도 정리.
 *   - 안쪽 공백·줄바꿈은 보존 (회상 노트라 사용자가 의도적 줄바꿈을 쓸 수 있다).
 *   - 분리 경로 `@/lib/entries/parse-memo` — Server Action 모듈("use server" 디렉티브) 외부에서
 *     vitest 가 jsdom 으로 import 가능하도록 lib/ 하위에 위치 (test-writer §J-1).
 *
 * actions.ts 가 이 모듈을 import 해 사용 — actions.ts 외부 테스트 가능성 회복 (006 §J-3 패턴과 정합).
 */
export function parseMemo(formData: FormData): string {
  const raw = formData.get("memo");
  if (typeof raw !== "string") return "";
  return raw.trim();
}
