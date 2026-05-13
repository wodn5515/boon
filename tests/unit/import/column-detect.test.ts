import { describe, expect, it } from "vitest";

import { detectColumnMapping } from "@/lib/import/column-detect";

/**
 * `lib/import/column-detect.ts::detectColumnMapping` 단위 테스트 (시나리오 12).
 *
 * 결정 로그 009 + lib/import/column-detect.ts JSDoc 의 규약을 회귀 잠금:
 *
 *  - 키워드 풀:
 *      name   = "이름·성명·고객·하객·조문객·name" (대소문자 무시)
 *      amount = "금액·축의금·부조금·조의금·amount·price" (대소문자 무시)
 *      note   = "비고·메모·관계·소속·note·memo·remark" (대소문자 무시)
 *  - 괄호 안 보조 단위는 normalize 단계에서 제거 ("금액(원)" → "금액").
 *  - 매칭 안 된 슬롯은 null — 사용자가 Step 2 에서 직접 고른다.
 *  - 양쪽 trim 후 비교.
 *
 * detectColumnMapping 자체는 이미 디자이너 라운드에 구현되어 있어 본 spec 의 일부는 "통과" 한다.
 * 그러나 본 spec 의 가치는:
 *   1. 회귀 잠금: worker 가 column-detect 를 본격 결합 라운드에서 손대더라도 규약 보존.
 *   2. 결혼식·장례식 시나리오 핵심 키워드 (축의금·부조금·조의금·관계) 가 자연스럽게 매칭.
 *
 * 따라서 본 spec 은 detectColumnMapping 의 시그니처가 변경되거나 키워드 일부가 누락되면 빨갛게 떨어진다.
 */

describe("lib/import/column-detect::detectColumnMapping", () => {
  // ============================================================
  // 시나리오 12-a — 명시 키워드 풀 매칭
  // ============================================================
  it("[시나리오 12-a] '이름' / '성명' / '고객' / 'name' 모두 name 슬롯으로 매칭", async () => {
    expect(detectColumnMapping(["이름", "기타"]).name).toBe("이름");
    expect(detectColumnMapping(["성명", "기타"]).name).toBe("성명");
    expect(detectColumnMapping(["고객명", "기타"]).name).toBe("고객명");
    expect(detectColumnMapping(["Name", "기타"]).name).toBe("Name");
    expect(detectColumnMapping(["NAME", "기타"]).name).toBe("NAME");
  });

  it("[시나리오 12-b] '금액' / '축의금' / '부조금' / 'amount' 는 amount 슬롯으로 매칭", async () => {
    expect(detectColumnMapping(["금액", "이름"]).amount).toBe("금액");
    expect(detectColumnMapping(["축의금", "이름"]).amount).toBe("축의금");
    expect(detectColumnMapping(["부조금", "이름"]).amount).toBe("부조금");
    expect(detectColumnMapping(["조의금", "이름"]).amount).toBe("조의금");
    expect(detectColumnMapping(["amount", "name"]).amount).toBe("amount");
    expect(detectColumnMapping(["Amount", "name"]).amount).toBe("Amount");
  });

  it("[시나리오 12-c] '비고' / '메모' / '관계' / 'note' 는 note 슬롯으로 매칭", async () => {
    expect(detectColumnMapping(["비고", "이름"]).note).toBe("비고");
    expect(detectColumnMapping(["메모", "이름"]).note).toBe("메모");
    expect(detectColumnMapping(["관계", "이름"]).note).toBe("관계");
    expect(detectColumnMapping(["note", "name"]).note).toBe("note");
    expect(detectColumnMapping(["Memo", "name"]).note).toBe("Memo");
  });

  // ============================================================
  // 시나리오 12-d — 괄호 단위 정규화
  // ============================================================
  it("[시나리오 12-d] 괄호 안 보조 단위는 normalize 단계에서 무시 ('금액(원)' → 금액 매칭)", async () => {
    const result = detectColumnMapping(["이름", "금액(원)", "비고(메모)"]);
    expect(result.name).toBe("이름");
    expect(result.amount).toBe("금액(원)");
    // 비고(메모) — 괄호 제거 후 "비고" + " " trim → "비고" → note 매칭.
    expect(result.note).toBe("비고(메모)");
  });

  // ============================================================
  // 시나리오 12-e — 매칭 안 된 슬롯은 null
  // ============================================================
  it("[시나리오 12-e] 알려지지 않은 헤더는 어느 슬롯에도 매칭 안 됨 — null 반환", async () => {
    const result = detectColumnMapping(["XYZ", "ABC", "FOO"]);
    expect(result.name).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.note).toBeNull();
  });

  it("[시나리오 12-f] 헤더 한 부분만 매칭되면 해당 슬롯만 채워짐", async () => {
    const result = detectColumnMapping(["이름", "XYZ", "ABC"]);
    expect(result.name).toBe("이름");
    expect(result.amount).toBeNull();
    expect(result.note).toBeNull();
  });

  // ============================================================
  // 시나리오 12-g — MOCK 헤더가 한 번에 통과 (디자이너 라운드 mock 시나리오 정합)
  // ============================================================
  it("[시나리오 12-g] MOCK_EXCEL_HEADERS 패턴 ['이름','금액(원)','비고'] — 세 슬롯 모두 자동 감지", async () => {
    const result = detectColumnMapping(["이름", "금액(원)", "비고"]);
    expect(result.name).toBe("이름");
    expect(result.amount).toBe("금액(원)");
    expect(result.note).toBe("비고");
  });

  // ============================================================
  // 시나리오 12-h — 양쪽 trim
  // ============================================================
  it("[시나리오 12-h] 양쪽 공백 무시 매칭 ('  이름  ' → name 슬롯)", async () => {
    const result = detectColumnMapping(["  이름  ", "  금액  "]);
    expect(result.name).toBe("  이름  ");
    expect(result.amount).toBe("  금액  ");
  });
});
