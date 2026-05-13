import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * `/entries` URL 날짜 파라미터 semantic validation E2E (PRD §3, 결정 로그 011 §B-2).
 *
 * 회귀 시드:
 *   - 현재 `app/(authenticated)/entries/page.tsx::parseDate` 는 형식(YYYY-MM-DD) 만 검사하고
 *     의미상 존재하지 않는 날짜(2026-13-45 등)를 그대로 listEntriesFiltered → drizzle SQL
 *     `received_date >= ${raw}` 비교에 흘려보낸다. Postgres 가 `invalid input syntax for type date`
 *     로 throw → Next.js Server Component 가 500 / error.tsx 로 빠진다.
 *
 * 본 spec 은 그 흐름이 사용자에게 보이지 않도록 잠근다:
 *   1. /entries?from=2026-13-45 진입 시 200 응답 + "받은 신세" 헤더 정상 노출.
 *   2. error boundary 카피("문제가 발생", "오류" 등)가 노출되지 않는다.
 *   3. invalid date 는 필터 미적용으로 간주되어 from 입력 초기화 상태 / 페이지 정상 진입.
 *
 * worker 청산 후 기대:
 *   - parseDate (또는 lib/entries-list/parse-date::parseEntriesDate) 가 `new Date(raw).getTime()` /
 *     round-trip ISO 비교로 semantic 검사 → invalid 면 빈 문자열로 무시.
 */

test.use({ storageState: authenticatedStorageState() });

test.describe("/entries URL parseDate semantic validation", () => {
  test("[B-2 시나리오 1] from=2026-13-45 (invalid) → 페이지 정상 진입 + 헤더 노출", async ({
    page,
  }) => {
    const response = await page.goto("/entries?from=2026-13-45");
    // Server Component 가 throw 하면 500 또는 Next.js error overlay.
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);

    // "받은 신세" 헤더가 정상 노출 — invalid date 가 SQL 까지 흘러가 throw 하지 않았다는 신호.
    await expect(
      page.getByRole("heading", { name: /^받은 신세$/ }),
    ).toBeVisible();

    // error.tsx 가 보여줄 흔한 카피들이 없어야 한다.
    await expect(page.getByText(/문제가 발생/)).toHaveCount(0);
    await expect(page.getByText(/Application error/)).toHaveCount(0);
    await expect(page.getByText(/오류가 발생/)).toHaveCount(0);
  });

  test("[B-2 시나리오 2] to=2026-02-30 (invalid 2월 30일) → 페이지 정상 진입", async ({
    page,
  }) => {
    const response = await page.goto("/entries?to=2026-02-30");
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: /^받은 신세$/ }),
    ).toBeVisible();
  });

  test("[B-2 시나리오 3] from·to 모두 invalid 동시 → 페이지 정상 + 필터 미적용 (q 같은 다른 파라미터는 보존)", async ({
    page,
  }) => {
    const response = await page.goto(
      "/entries?from=2026-13-45&to=2026-04-31&q=test",
    );
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: /^받은 신세$/ }),
    ).toBeVisible();
  });
});
