import { describe, expect, it } from "vitest";

/**
 * lib/avatar.ts 단위 테스트.
 *
 * 시나리오 14: getInitial — 한글 1자 / 영어 2자 / 빈문자 / 이모지·한자 / 단일 단어
 * 시나리오 15: getAvatarColor — 결정성 + 풀 분포
 *
 * 디자이너 룰 (lib/avatar.ts 주석 기준):
 *   - 한글(가-힣) 또는 동아시아 한자 BMP 가 1자라도 있으면 그 첫 자
 *   - 그 외 → ascii(공백 제거) 첫 2자 대문자
 *   - 빈 입력 → "?"
 *   - 이모지는 한글 매처에 안 잡히므로 ascii 경로로 빠짐. 다만 ascii 가 비어
 *     "한자 파티" 식이면 첫 한자 1자가 잡힘.
 *
 * 이 spec 은 worker 가 lib/avatar.ts 를 변경할 때 (만약 변경한다면) 룰이
 * 깨지지 않게 잠그는 회귀 역할도 한다.
 */

import { AVATAR_COLOR_POOL, getAvatarColor, getInitial } from "@/lib/avatar";

describe("getInitial", () => {
  it('한국어 단일 이름 "박지원" → 첫 한 글자 "박"', () => {
    expect(getInitial("박지원")).toBe("박");
  });

  it('영어 풀네임 "John Doe" → 공백을 무시한 첫 2자 대문자 "JO"', () => {
    expect(getInitial("John Doe")).toBe("JO");
  });

  it('빈 문자열 → "?"', () => {
    expect(getInitial("")).toBe("?");
  });

  it('공백만 있는 문자열 → "?" (trim 후 빈)', () => {
    expect(getInitial("   ")).toBe("?");
  });

  it('이모지 + 한글 "🎉파티" → 첫 한글 "파" (한글 매처 우선)', () => {
    // 디자이너 룰 (lib/avatar.ts 주석): 한글이 1자라도 있으면 그 첫 한글 1자.
    // 이모지는 ascii 경로로만 잡히며, 한글이 있으면 그 분기는 건너뛴다.
    expect(getInitial("🎉파티")).toBe("파");
  });

  it('단일 영어 단어 "John" → "JO" (대문자 2자)', () => {
    expect(getInitial("John")).toBe("JO");
  });

  it('한자 단일 이름 "金" → 그 한자 1자', () => {
    expect(getInitial("金")).toBe("金");
  });
});

describe("getAvatarColor", () => {
  it("결정성: 같은 입력은 항상 같은 색을 돌려준다", () => {
    expect(getAvatarColor("박지원")).toBe(getAvatarColor("박지원"));
    expect(getAvatarColor("Alex Park")).toBe(getAvatarColor("Alex Park"));
  });

  it("반환 값은 AVATAR_COLOR_POOL 중 하나다", () => {
    const samples = ["박지원", "김민준", "Alex", "이지은", "Sam"];
    for (const s of samples) {
      expect(AVATAR_COLOR_POOL).toContain(getAvatarColor(s));
    }
  });

  it("분포: 다양한 이름 50개를 해시하면 풀의 모든 색에 적어도 1번씩 매핑된다", () => {
    // 한글·영어·혼합 등 50개 이름 — 합 분포가 풀 길이(6)로 모듈러 매핑됐을 때
    // 모든 버킷에 1개 이상 떨어지는지 확인. 균일성까지는 강제하지 않고
    // "한 색에만 쏠리지 않음" 을 잠그는 약한 분포 조건.
    const names = [
      "박지원", "김민준", "이지은", "최서연", "정하준",
      "조유나", "윤서영", "강도윤", "임수아", "한지호",
      "Alex", "Brian", "Cathy", "Daniel", "Erin",
      "Frank", "Gina", "Henry", "Iris", "Jack",
      "Kate", "Leo", "Mia", "Nora", "Owen",
      "Paul", "Quinn", "Ruth", "Sam", "Tina",
      "Uma", "Vera", "Will", "Xena", "Yuna",
      "Zoe", "박서연", "이도현", "최민서", "정유진",
      "조하늘", "윤지안", "강수민", "임채원", "한예슬",
      "John Doe", "Jane Smith", "박지원2", "Alex Kim", "Sam Lee",
    ];
    const buckets = new Map<string, number>();
    for (const n of names) {
      const c = getAvatarColor(n);
      buckets.set(c, (buckets.get(c) ?? 0) + 1);
    }
    // 풀의 모든 색이 적어도 1번 등장.
    for (const color of AVATAR_COLOR_POOL) {
      expect(buckets.get(color) ?? 0).toBeGreaterThan(0);
    }
  });
});
