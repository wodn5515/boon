import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * `/friends/[id]` 통계 보강 슬라이스 E2E (PR #9 — 월별 추이 + 활동 요약).
 *
 * 검증 시나리오:
 *   1. 친구 상세 진입 → "월별 추이" + "활동 요약" 섹션이 모두 노출된다
 *   2. 신세 0건 친구 → 두 섹션 모두 부드러운 환기 카피로 빈 상태 (회상 노트 톤)
 *   3. 신세 1건 친구 → 첫/마지막 신세 동일 날짜 노출, 평균 간격은 placeholder 카피
 *   4. 신세 다수 (3건) 친구 → 첫 신세 한국어 포맷 + "평균 N일에 한 번 마음을 받았어요"
 *      + AreaChart SVG 가 그려진다
 *
 * 인증: 모든 시나리오가 인증 fixture (storageState).
 *
 * 사전 가정 (worker / 디자이너 골격):
 *   - `/friends/[id]` page 가 `aggregateMonthlyTrend(friendEntries)` /
 *     `summarizeActivity(friendEntries)` 결과를 그대로 props 로 넘긴다.
 *   - MonthlyTrendChart 가 Recharts AreaChart 를 그려 `svg` element 가 DOM 에 노출된다.
 *   - FriendActivitySummaryCard 의 카피:
 *       - 빈: "아직 받은 신세가 없어서 통계가 없어요"
 *       - 1건: "신세가 한 번 더 쌓이면 평균 간격도 보여드려요"
 *       - 다수: "처음 받은 신세는 {date}이에요", "평균 N일에 한 번 마음을 받았어요"
 *   - MonthlyTrendChart 빈 상태 (data.length === 0) 시 page 가 "추이는 신세가 한 개 이상
 *     쌓이면 보여드려요" 카피 노출.
 *
 * 테스트 격리: 친구 이름·메모에 unique suffix 부여 — entries.spec.ts 패턴 그대로.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

async function createFriend(page: import("@playwright/test").Page, name: string) {
  await page.goto("/friends");
  await page.getByRole("button", { name: /친구 추가/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/이름/).fill(name);
  await dialog.getByRole("button", { name: /친구 추가/ }).click();
  await expect(dialog).toBeHidden();
}

/**
 * 친구 상세에서 신세 1건을 만든다 — `received_date` 와 memo 를 지정.
 *
 * EntryFormDialog 의 friend combobox 는 친구 상세 페이지 진입 시 `defaultFriendId` 로
 * 이미 선택돼 있다 (friend-entries.spec.ts 시나리오 6 참고). 따라서 본 헬퍼는
 * 카테고리는 기본값 유지하고 메모·날짜만 채워 빠르게 저장한다.
 */
async function addEntryFromFriendDetail(
  page: import("@playwright/test").Page,
  opts: { friendName: string; receivedDate: string; memo: string },
) {
  await page
    .getByRole("button", {
      name: new RegExp(`${opts.friendName}한테 받은 신세 추가`),
    })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/내용 메모/).fill(opts.memo);
  await dialog.getByLabel("받은 날짜").fill(opts.receivedDate);
  await dialog.getByRole("button", { name: "신세 추가하기" }).click();
  await expect(dialog).toBeHidden();
}

async function gotoFriendDetail(
  page: import("@playwright/test").Page,
  friendName: string,
) {
  await page.goto("/friends");
  await page.getByRole("link", { name: new RegExp(friendName) }).click();
  await page.waitForURL(/\/friends\/[^/]+$/);
}

test.describe("/friends/[id] 통계 보강 — 월별 추이 + 활동 요약", () => {
  test("[시나리오 1] 친구 상세 진입 시 '월별 추이' 와 '활동 요약' 섹션이 모두 노출된다", async ({
    page,
  }) => {
    const friendName = uniqueName("통계친구");
    await createFriend(page, friendName);
    await gotoFriendDetail(page, friendName);

    // "월별 추이" 카드 타이틀 (CardTitle 텍스트).
    await expect(page.getByText("월별 추이", { exact: true })).toBeVisible();
    // "활동 요약" 카드 타이틀.
    await expect(page.getByText("활동 요약", { exact: true })).toBeVisible();
  });

  test("[시나리오 2] 신세 0건 친구 → 두 섹션 모두 부드러운 환기 카피로 빈 상태", async ({
    page,
  }) => {
    const friendName = uniqueName("0건친구");
    await createFriend(page, friendName);
    await gotoFriendDetail(page, friendName);

    // 월별 추이: 빈 상태 카피.
    await expect(
      page.getByText("추이는 신세가 한 개 이상 쌓이면 보여드려요."),
    ).toBeVisible();

    // 활동 요약: 빈 상태 카피.
    await expect(
      page.getByText("아직 받은 신세가 없어서 통계가 없어요."),
    ).toBeVisible();
  });

  test("[시나리오 3] 신세 1건 친구 → 평균 간격 자리에 placeholder 카피가 노출된다", async ({
    page,
  }) => {
    const friendName = uniqueName("1건친구");
    await createFriend(page, friendName);
    await gotoFriendDetail(page, friendName);

    await addEntryFromFriendDetail(page, {
      friendName,
      receivedDate: "2024-11-23",
      memo: uniqueName("1건-메모"),
    });

    // 활동 요약: 첫·마지막 신세는 동일 날짜 한국어 포맷으로 노출.
    // 디자이너 카피: "처음 받은 신세는 {date}이에요" / "가장 최근 신세는 {date}"
    await expect(
      page.getByText("2024년 11월 23일", { exact: false }).first(),
    ).toBeVisible();

    // 평균 간격 자리 — placeholder 카피.
    await expect(
      page.getByText("신세가 한 번 더 쌓이면 평균 간격도 보여드려요."),
    ).toBeVisible();
  });

  test("[시나리오 4] 신세 3건 친구 → 첫 신세 한국어 포맷 + 평균 카피 + 차트 SVG", async ({
    page,
  }) => {
    const friendName = uniqueName("다수친구");
    await createFriend(page, friendName);
    await gotoFriendDetail(page, friendName);

    // 3건을 1월/4월/7월로 분산해 평균 91일 (91 = (Jul-Jan)/2).
    await addEntryFromFriendDetail(page, {
      friendName,
      receivedDate: "2024-01-01",
      memo: uniqueName("1월"),
    });
    await addEntryFromFriendDetail(page, {
      friendName,
      receivedDate: "2024-04-01",
      memo: uniqueName("4월"),
    });
    await addEntryFromFriendDetail(page, {
      friendName,
      receivedDate: "2024-07-01",
      memo: uniqueName("7월"),
    });

    // 첫 신세 = 2024-01-01 → "2024년 1월 1일" (zero-padding 없음).
    await expect(
      page.getByText("2024년 1월 1일", { exact: false }).first(),
    ).toBeVisible();
    // 가장 최근 신세 = 2024-07-01 → "2024년 7월 1일".
    await expect(
      page.getByText("2024년 7월 1일", { exact: false }).first(),
    ).toBeVisible();
    // 평균 간격 카피 — 91일. 회상 톤 카피 ("마음을 받았어요").
    await expect(
      page.getByText(/평균.*91일.*에 한 번 마음을 받았어요/),
    ).toBeVisible();

    // 월별 추이 차트 — Recharts AreaChart 가 SVG 로 그려진다. "월별 추이" CardTitle 의
    // 부모 카드 안에 svg 노드가 존재하는지 직접 확인하는 대신, page 전체에서 SVG 한 개
    // 이상이 그려졌는지 + 빈 상태 카피가 보이지 않는지로 잠근다.
    await expect(
      page.getByText("추이는 신세가 한 개 이상 쌓이면 보여드려요."),
    ).toHaveCount(0);
    // Recharts 가 그리는 surface — `.recharts-surface` 클래스의 svg.
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  });
});
