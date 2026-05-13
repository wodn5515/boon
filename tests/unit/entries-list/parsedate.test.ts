import { describe, expect, it } from "vitest";

/**
 * `/entries` URL searchParams 의 from/to 날짜 파싱 — semantic validation (011 §B-2).
 *
 * 현재 `app/(authenticated)/entries/page.tsx::parseDate` 는 `/^\d{4}-\d{2}-\d{2}$/` 형식
 * 정규식만 검사한다. 즉 `2026-13-45` 처럼 형식은 맞지만 의미상 존재할 수 없는 날짜가 그대로
 * SQL 까지 흘러가 Postgres 단에서 `invalid input syntax for type date` 로 throw 한다 (PR #7
 * 🟢 #1 + PR #9 review §).
 *
 * 본 spec 은 그 검증을 lib 단으로 끌어올린 단일 진실 원천 함수를 회귀 잠금한다.
 * worker 청산 후 기대 형태:
 *
 *   ```ts
 *   // lib/entries-list/parse-date.ts
 *   export function parseEntriesDate(raw: string): string {
 *     if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
 *     const t = new Date(`${raw}T00:00:00Z`).getTime();
 *     if (!Number.isFinite(t)) return "";
 *     // round-trip 비교로 2026-02-30 → 2026-03-02 처럼 normalize 된 경우 거부.
 *     const iso = new Date(t).toISOString().slice(0, 10);
 *     return iso === raw ? raw : "";
 *   }
 *   ```
 *
 * `app/(authenticated)/entries/page.tsx::parseDate` 는 이 lib 함수에 위임하도록 청산한다.
 *
 * 빨강 시드:
 *   - 모듈 자체가 아직 없음 → dynamic import 가 런타임 throw → 본 spec 의 모든 케이스가 빨강.
 *
 * memo-builder.test.ts 시나리오 13 의 dynamic import 패턴을 그대로 따라
 * typecheck 는 통과시키되 vitest 단계에서만 빨강 시드를 노출한다.
 */

type ParseEntriesDateFn = (raw: string) => string;
const PARSE_DATE_PATH = "@/lib/entries-list/parse-date";

async function loadParseEntriesDate(): Promise<ParseEntriesDateFn> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ PARSE_DATE_PATH)) as unknown as Record<
      string,
      unknown
    >;
  } catch (e) {
    throw new Error(
      "lib/entries-list/parse-date.ts 모듈을 불러올 수 없어요. " +
        "worker 가 app/(authenticated)/entries/page.tsx::parseDate 를 " +
        "`lib/entries-list/parse-date.ts::parseEntriesDate` 로 추출하지 않았어요. (011 §B-2)\n" +
        `원본: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const fn = mod.parseEntriesDate;
  if (typeof fn !== "function") {
    throw new Error(
      "parseEntriesDate 가 lib/entries-list/parse-date.ts 에서 named export 되지 않았어요. " +
        "worker 결합 시 `export function parseEntriesDate(raw: string): string` 으로 노출하세요.",
    );
  }
  return fn as ParseEntriesDateFn;
}

describe("parseEntriesDate (semantic validation)", () => {
  it("[정상] YYYY-MM-DD 형식 + 실제 존재 날짜는 그대로 반환", async () => {
    const parseEntriesDate = await loadParseEntriesDate();
    expect(parseEntriesDate("2026-05-13")).toBe("2026-05-13");
    expect(parseEntriesDate("2024-02-29")).toBe("2024-02-29"); // 윤년
    expect(parseEntriesDate("2024-12-31")).toBe("2024-12-31");
  });

  it("[형식 실패] YYYY-MM-DD 형식이 아니면 빈 문자열", async () => {
    const parseEntriesDate = await loadParseEntriesDate();
    expect(parseEntriesDate("")).toBe("");
    expect(parseEntriesDate("2026/05/13")).toBe("");
    expect(parseEntriesDate("2026-5-1")).toBe("");
    expect(parseEntriesDate("not-a-date")).toBe("");
  });

  it("[semantic 실패] 13월·45일처럼 존재하지 않는 날짜는 빈 문자열로 무시", async () => {
    const parseEntriesDate = await loadParseEntriesDate();
    // 형식은 맞지만 SQL date 캐스트 시 throw 가 나는 입력들.
    expect(parseEntriesDate("2026-13-45")).toBe("");
    expect(parseEntriesDate("2026-13-01")).toBe(""); // 13월
    expect(parseEntriesDate("2026-00-15")).toBe(""); // 0월
    expect(parseEntriesDate("2026-02-30")).toBe(""); // 2월 30일
    expect(parseEntriesDate("2023-02-29")).toBe(""); // 평년 윤일
    expect(parseEntriesDate("2026-04-31")).toBe(""); // 4월 31일
  });
});
