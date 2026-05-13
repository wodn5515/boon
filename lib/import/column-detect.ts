/**
 * 엑셀 헤더 자동 감지 (PRD §3 + 디자이너 자율 결정).
 *
 * Step 2 컬럼 매핑 시, 사용자가 매번 드롭다운으로 매핑하는 마찰을 줄이기 위해
 * 헤더 텍스트가 잘 알려진 한국어·영어 키워드면 자동으로 미리 선택해 둔다.
 * 사용자가 잘못 감지된 경우 직접 변경 가능.
 *
 * 키워드 풀 (Lead 자율 판단 위임):
 *   - name: "이름·성명·고객·하객·조문객·name"
 *   - amount: "금액·축의금·부조금·조의금·금액(원)·amount·price"
 *   - note: "비고·메모·관계·소속·note·memo·remark"
 *
 * 비교는 case-insensitive, 양쪽 trim, 괄호 안 보조 단위는 무시 ("금액(원)" → "금액").
 */

const NAME_KEYWORDS = [
  "이름",
  "성명",
  "고객",
  "고객명",
  "하객",
  "하객명",
  "조문객",
  "name",
];

const AMOUNT_KEYWORDS = [
  "금액",
  "축의금",
  "부조금",
  "조의금",
  "amount",
  "price",
  "money",
];

const NOTE_KEYWORDS = [
  "비고",
  "메모",
  "관계",
  "소속",
  "비고/메모",
  "note",
  "memo",
  "remark",
  "comment",
];

function normalize(header: string): string {
  // 괄호와 그 안 내용 제거 → 양쪽 trim → 소문자.
  return header.replace(/\([^)]*\)/g, "").trim().toLowerCase();
}

function findMatch(headers: ReadonlyArray<string>, keywords: ReadonlyArray<string>): string | null {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  for (const h of headers) {
    const n = normalize(h);
    if (n.length === 0) continue;
    if (lowerKeywords.some((k) => n === k || n.includes(k))) {
      return h;
    }
  }
  return null;
}

/**
 * 엑셀 헤더 배열을 보고 컬럼 매핑 슬롯의 초기값을 추측한다.
 * 매칭 안 된 슬롯은 null — 사용자가 Step 2 에서 직접 고른다.
 */
export function detectColumnMapping(headers: ReadonlyArray<string>): {
  name: string | null;
  amount: string | null;
  note: string | null;
} {
  return {
    name: findMatch(headers, NAME_KEYWORDS),
    amount: findMatch(headers, AMOUNT_KEYWORDS),
    note: findMatch(headers, NOTE_KEYWORDS),
  };
}
