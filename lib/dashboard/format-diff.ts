/**
 * 위젯 D '지난 달 ↔ 이번 달' 비교 카피 헬퍼 (결정 로그 011 §C-2).
 *
 * 회귀 시드 (PR #6 review §):
 *   - 이전 `components/dashboard/widget-this-month-summary.tsx::formatDiff(prev, cur)` 는 prev==null
 *     만 fallback. prev=0 (첫 달 사용자) 일 때 "지난 달 0건 → 이번 달 N건" 단순 카피로 떨어지지만,
 *     회상 노트 톤(PRD §2)에선 "0건 → N건" 비교 자체가 의미 없다.
 *   - 더 본질적인 회귀 시드: 향후 비율 계산(`(cur - prev) / prev * 100`) 도입 시 prev=0 이면
 *     Infinity / NaN 이 그대로 노출될 위험.
 *
 * 본 모듈은 prev=null/0 분기를 명시 분리한다.
 *   1. prev == null → null (UI 에서 카피 생략).
 *   2. prev === 0 → 부드러운 카피 ("지난 달과 비교할 자료가 아직 없어요"). 비율 계산 자체를 안 한다.
 *   3. prev > 0 → "지난 달 N건 → 이번 달 M건" 단순 표기 (강박/부추김 카피 회피).
 *
 * 디자이너 위임 결정 (앞 슬라이스 결정 유지):
 *   - cur >= prev / cur < prev 분기를 따로 안 둔다 — "더 많이!" / "부담 줄어든 회상" 같은 가치
 *     판단 카피는 강박 톤이라 의도적으로 피한다.
 *   - prev=0 의 카피 키워드는 "지난 달" + "비교" 또는 "첫 달" — UI 에서 한 줄로 자연스럽게 읽힘.
 */

/**
 * 위젯 D 의 비교 카피를 만든다. null 반환 시 호출자가 카피 영역 자체를 생략한다.
 *
 * @param prev 지난 달 신세 수. null 이면 비교 자체 무의미 (가입 직후 첫 달 데이터 자체 없음).
 * @param cur  이번 달 신세 수.
 */
export function formatDiff(prev: number | null, cur: number): string | null {
  if (prev == null) return null;
  if (prev === 0) {
    // 첫 달 사용자 또는 지난 달 비활동 — 비교 자체가 의미 없는 회상 톤.
    return "지난 달과 비교할 자료가 아직 없어요";
  }
  return `지난 달 ${prev}건 → 이번 달 ${cur}건`;
}
