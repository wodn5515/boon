import { describe, expect, it } from "vitest";

/**
 * `lib/categories/types.ts::sortCategories` 단위 테스트 (시나리오 21).
 *
 * 디자이너 룰 (types.ts 주석 그대로):
 *   - 시스템 카테고리(is_system=true) 가 항상 먼저
 *   - 동일 그룹 내에서는 sort_order 오름차순
 *
 * 회귀 잠금 목적:
 *   - worker 가 listCategories 결합 시 정렬 책임을 SQL ORDER BY 로 옮기더라도
 *     이 함수의 동작 자체는 디자이너 골격이 export 한 그대로 유지되어야 한다 (다른 호출처 보호).
 */

import { sortCategories, type Category } from "@/lib/categories/types";

function cat(
  partial: Partial<Category> & { id: string; is_system: boolean; sort_order: number },
): Category {
  return {
    name: partial.name ?? "x",
    icon: partial.icon ?? null,
    color: partial.color ?? "#22c55e",
    entry_count: partial.entry_count ?? 0,
    ...partial,
  };
}

describe("sortCategories", () => {
  it("시스템 카테고리가 사용자 카테고리보다 항상 먼저 온다", () => {
    const input: Category[] = [
      cat({ id: "u-1", is_system: false, sort_order: 0 }),
      cat({ id: "s-1", is_system: true, sort_order: 10 }),
    ];
    const out = sortCategories(input);
    expect(out.map((c) => c.id)).toEqual(["s-1", "u-1"]);
  });

  it("동일 그룹 내에서는 sort_order 오름차순으로 정렬한다", () => {
    const input: Category[] = [
      cat({ id: "s-c", is_system: true, sort_order: 2 }),
      cat({ id: "s-a", is_system: true, sort_order: 0 }),
      cat({ id: "s-b", is_system: true, sort_order: 1 }),
      cat({ id: "u-c", is_system: false, sort_order: 30 }),
      cat({ id: "u-a", is_system: false, sort_order: 10 }),
      cat({ id: "u-b", is_system: false, sort_order: 20 }),
    ];
    const out = sortCategories(input);
    expect(out.map((c) => c.id)).toEqual([
      "s-a",
      "s-b",
      "s-c",
      "u-a",
      "u-b",
      "u-c",
    ]);
  });

  it("원본 배열을 변형하지 않는다 (불변)", () => {
    const input: Category[] = [
      cat({ id: "u-1", is_system: false, sort_order: 5 }),
      cat({ id: "s-1", is_system: true, sort_order: 0 }),
    ];
    const snapshot = input.map((c) => c.id);
    sortCategories(input);
    expect(input.map((c) => c.id)).toEqual(snapshot);
  });

  it("빈 배열을 받으면 빈 배열을 돌려준다", () => {
    expect(sortCategories([])).toEqual([]);
  });
});
