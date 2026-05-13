/**
 * 엑셀 import 메모 빌더 (결정 로그 009 §I).
 *
 * Step 5 미리보기와 `bulkImportEntries` 두 호출 지점이 **같은 함수**를 공유한다.
 * 사용자가 미리보기에서 본 메모와 DB 에 저장되는 메모가 표류 없이 정확히 같음을 보장.
 *
 * 출력 규약 (시나리오 13-a~13-h 회귀 잠금):
 *  - 구분자: ` · ` (가운데점 좌우 공백 1칸)
 *  - 누락 필드(amount/note) skip — 빈 문자열도 skip
 *  - 금액 ko-KR locale 콤마 포맷: "100000" → "금액 100,000원"
 *  - 한국어 단위(억·만·천·백·십)는 zero-padding 으로 확장 후 콤마 포맷:
 *      "10만원" → "10" + "0000" → "100,000원"  (시나리오 13-f)
 *  - amount 에서 숫자도 단위도 0개("일금") → 원문 그대로 "금액 일금"  (시나리오 13-f-2)
 *  - note 양쪽 공백은 trim 되어 합쳐짐  (시나리오 13-h)
 *
 * eventName 과 name 은 호출 시점에 채워져 있다고 가정 (BatchSettings + NormalizedRow 가 보장).
 */

export type BuildMemoInput = {
  eventName: string;
  name: string;
  amount: string | null;
  note: string | null;
};

/**
 * 한국어 자릿수 단위를 zero-padding 으로 확장한다.
 *   "10만"  → "100000"
 *   "1억"   → "100000000"
 *   "3천"   → "3000"
 * 단위가 없으면 단순 digit-only strip.
 *
 * 결정 로그 011 §B-3 — Step 4 검토 화면(`step-4-matching-review.tsx::formatAmount`) 도 같은
 *   규약으로 표시해야 Step 4 row 헤더 ≡ Step 5 미리보기 ≡ DB 메모 가 한 줄로 정렬된다.
 *   별도 인라인 `replace(/[^\d]/g, "")` 로직이 떠돌면 "10만원" → "10원" 같은 표류 발생.
 *   본 함수를 named export 로 노출해 import 측 단일 진실 원천화.
 */
export function extractDigitsKoreanAware(amount: string): string {
  let s = amount;
  s = s.replace(/억/g, "00000000");
  s = s.replace(/만/g, "0000");
  s = s.replace(/천/g, "000");
  s = s.replace(/백/g, "00");
  s = s.replace(/십/g, "0");
  return s.replace(/[^\d]/g, "");
}

export function buildMemo({
  eventName,
  name,
  amount,
  note,
}: BuildMemoInput): string {
  const parts: string[] = [eventName, name];

  if (amount && amount.trim().length > 0) {
    const onlyDigits = extractDigitsKoreanAware(amount);
    if (onlyDigits.length > 0) {
      const n = Number(onlyDigits);
      if (Number.isFinite(n)) {
        parts.push(`금액 ${n.toLocaleString("ko-KR")}원`);
      } else {
        parts.push(`금액 ${amount}`);
      }
    } else {
      // 숫자도 단위도 0개("일금") — 원문 그대로 분기.
      parts.push(`금액 ${amount}`);
    }
  }

  if (note && note.trim().length > 0) {
    parts.push(note.trim());
  }

  return parts.join(" · ");
}
