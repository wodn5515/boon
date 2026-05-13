import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * 메인 대시보드 위젯 E2E (PRD §3, 결정 로그 D-013 / 007-dashboard-widgets).
 *
 * 검증 시나리오:
 *   1. `/` 진입 → 인사말("안녕하세요, …") + 위젯 4종 헤딩 모두 렌더
 *   2. 위젯 A "최근 받은 신세" — 데이터 있을 때 entry 메모 노출, 빈 상태 카피
 *   3. 위젯 B "친구들" — 친구 카드 6명 이내 + 받은 신세 수 표시
 *   4. 위젯 C "다가오는 생일" — 30일 내 생일 친구 표시 / 빈 상태 카피
 *   5. 위젯 D "이번 달 받은 마음" — 이번 달 신세 수 + 카테고리 칩 + Top 친구
 *   6. 위젯 A "전체 보기" 클릭 → `/entries` 이동 (페이지 자체는 다음 슬라이스라 redirect or 정상 응답 둘 다 OK)
 *   7. 위젯 B "전체 보기" 클릭 → `/friends`
 *
 * 인증: 모든 시나리오가 인증 fixture 적용 (storageState).
 *
 * 사전 가정 (worker 가 결합):
 *   - `app/(authenticated)/page.tsx` 가 mock 함수 호출을 실제 query 결합으로 갈아끼웠다.
 *     - mockGetRecentEntries → getRecentEntries(5)
 *     - mockGetTopFriends → getTopFriends(6)
 *     - mockGetUpcomingBirthdays → getUpcomingBirthdays(30)
 *     - mockGetThisMonthSummary → getThisMonthSummary()
 *   - E2E_BYPASS_AUTH=1 분기에서 각 query 가 e2e-store 위에서 동작해
 *     테스트가 만든 친구·entry 가 위젯에 그대로 비친다.
 *
 * 테스트 격리:
 *   - test-with-reset fixture 가 매 테스트마다 /api/_test/reset 으로 store 비움.
 *   - 우리가 만든 친구·메모 이름은 unique suffix 로 다른 spec 과 충돌 회피.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

async function createFriend(
  page: import("@playwright/test").Page,
  name: string,
  opts: { birthdayMonth?: string; birthdayDay?: string } = {},
) {
  await page.goto("/friends");
  await page.getByRole("button", { name: /친구 추가/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/이름/).fill(name);
  if (opts.birthdayMonth) {
    await dialog.getByRole("combobox", { name: /월/ }).click();
    await page
      .getByRole("option", { name: opts.birthdayMonth, exact: true })
      .click();
  }
  if (opts.birthdayDay) {
    await dialog.getByRole("combobox", { name: /일/ }).click();
    await page
      .getByRole("option", { name: opts.birthdayDay, exact: true })
      .click();
  }
  await dialog.getByRole("button", { name: /친구 추가/ }).click();
  await expect(dialog).toBeHidden();
}

async function createEntryForFriend(
  page: import("@playwright/test").Page,
  friendName: string,
  memo: string,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "친구 선택" }).click();
  await page
    .getByRole("textbox", { name: "친구 이름 검색" })
    .fill(friendName);
  await page.getByRole("option", { name: new RegExp(friendName) }).click();

  await dialog.getByLabel(/내용 메모/).fill(memo);
  await dialog.getByRole("button", { name: "신세 추가하기" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("/ 메인 대시보드 위젯", () => {
  test("[시나리오 1] / 진입 시 인사말과 위젯 4종 헤딩이 모두 보인다", async ({
    page,
  }) => {
    await page.goto("/");

    // 인사말.
    await expect(
      page.getByRole("heading", { name: /^안녕하세요/, level: 1 }),
    ).toBeVisible();

    // 위젯 4종 헤딩 (CardTitle 이라 role=heading 가 아닌 일반 텍스트로 잡힘 — getByText 로 잡되 exact:true).
    await expect(page.getByText("최근 받은 신세", { exact: true })).toBeVisible();
    await expect(page.getByText("친구들", { exact: true })).toBeVisible();
    await expect(page.getByText("다가오는 생일", { exact: true })).toBeVisible();
    await expect(
      page.getByText("이번 달 받은 마음", { exact: true }),
    ).toBeVisible();
  });

  test("[시나리오 2] 위젯 A — 빈 상태일 땐 '아직 받은 신세가 없어요' 카피, 신세 추가 후엔 메모가 노출된다", async ({
    page,
  }) => {
    // 초기 진입: store 가 reset 직후라 entries 0건 → 빈 상태 카피 노출.
    await page.goto("/");
    await expect(
      page.getByText("아직 받은 신세가 없어요", { exact: false }),
    ).toBeVisible();

    // 친구 + entry 한 건 생성.
    const friend = uniqueName("위젯A친구");
    const memo = uniqueName("위젯A-메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    // 메인으로 돌아와 위젯 A 안에 메모가 보인다.
    await page.goto("/");
    await expect(page.getByText(memo, { exact: false })).toBeVisible();
    // 빈 상태 카피는 사라진다.
    await expect(
      page.getByText("아직 받은 신세가 없어요", { exact: false }),
    ).toHaveCount(0);
  });

  test("[시나리오 3] 위젯 B — 친구 카드와 받은 신세 수가 노출된다 (6명 이내)", async ({
    page,
  }) => {
    const friend = uniqueName("위젯B친구");
    const memo = uniqueName("위젯B-메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    await page.goto("/");

    // 위젯 B "친구들" 안에 친구 이름이 보인다 (Link 형태).
    await expect(
      page.getByRole("link", { name: `${friend} 상세 보기` }),
    ).toBeVisible();

    // "받은 신세 N개" 패턴이 노출된다 (count 가 1 이상이어야 의미 있는 검증).
    await expect(page.getByText(/받은 신세\s+1\s*개/)).toBeVisible();
  });

  test("[시나리오 4] 위젯 C — 빈 상태 카피, 친구 생일 등록 후엔 다가오는 생일이 보인다", async ({
    page,
  }) => {
    // 빈 상태.
    await page.goto("/");
    await expect(
      page.getByText("이번 달 생일인 친구가 없어요", { exact: false }),
    ).toBeVisible();

    // 30일 내 생일 친구를 등록 — "오늘" 의 month/day 를 사용해 D-0 으로 강제.
    // playwright config 의 timezoneId = Asia/Seoul 이라 브라우저 Date 도 동일 타임존.
    const today = await page.evaluate(() => {
      const d = new Date();
      return { month: d.getMonth() + 1, day: d.getDate() };
    });

    const friend = uniqueName("위젯C친구");
    await createFriend(page, friend, {
      birthdayMonth: `${today.month}월`,
      birthdayDay: `${today.day}일`,
    });

    await page.goto("/");

    // "다가오는 생일" 카드 안에 친구 이름이 등장.
    await expect(
      page.getByRole("link", { name: `${friend} 상세 보기` }),
    ).toBeVisible();
    // D-0 → "오늘" 배지.
    await expect(page.getByLabel("생일 오늘")).toBeVisible();
  });

  test("[시나리오 5] 위젯 D — 이번 달 신세를 추가하면 count 가 0 → 1 로 바뀌고 Top 친구에 등장한다", async ({
    page,
  }) => {
    // 빈 상태 카피.
    await page.goto("/");
    await expect(
      page.getByText("이번 달 받은 신세가 아직 없어요", { exact: false }),
    ).toBeVisible();

    // 친구 + 오늘 날짜 entry 1건 (entries 기본 received_date = 오늘).
    const friend = uniqueName("위젯D친구");
    const memo = uniqueName("위젯D-메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    await page.goto("/");

    // count 영역에 "1" 이 보인다 — 큰 숫자 강조 부분 (tabular-nums + 큰 폰트).
    // 위젯 D 의 strong-숫자 영역과 "건" 단위가 함께 보이는지로 검증.
    const summaryCard = page
      .getByText("이번 달 받은 마음", { exact: true })
      .locator("xpath=ancestor::*[contains(@class, 'gap-')][1]/..");
    // 좀 더 안전하게: "이번 달" 라벨 옆 숫자 1.
    await expect(page.getByText(/^1$/).first()).toBeVisible();
    await expect(page.getByText("건", { exact: true }).first()).toBeVisible();

    // Top 친구 영역에 친구 이름이 등장 (1위 라벨 + 친구 이름).
    await expect(page.getByLabel("1위")).toBeVisible();
    await expect(summaryCard.getByText(friend, { exact: false })).toBeVisible();
  });

  test("[시나리오 6] 위젯 A '전체 보기' 클릭 → /entries 로 이동", async ({
    page,
  }) => {
    // 데이터가 있어야 "전체 보기" 가 노출됨 — 친구 + entry 한 건 시드.
    const friend = uniqueName("전체보기A친구");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, uniqueName("전체보기A-메모"));

    await page.goto("/");

    await page.getByRole("link", { name: "받은 신세 전체 보기" }).click();

    // /entries 페이지는 다음 슬라이스라 404 가능 — pathname 만 확인하고 응답코드는 무관.
    await page.waitForURL(/\/entries$/);
    expect(new URL(page.url()).pathname).toBe("/entries");
  });

  test("[시나리오 7] 위젯 B '전체 보기' 클릭 → /friends 로 이동", async ({
    page,
  }) => {
    const friend = uniqueName("전체보기B친구");
    await createFriend(page, friend);

    await page.goto("/");
    await page.getByRole("link", { name: "친구 전체 보기" }).click();

    await page.waitForURL("**/friends");
    expect(new URL(page.url()).pathname).toBe("/friends");
    // /friends 페이지에 우리가 만든 친구 카드가 보인다 — 환경 sanity.
    await expect(
      page.getByRole("link", { name: new RegExp(friend) }),
    ).toBeVisible();
  });
});
