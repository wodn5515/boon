import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * 위젯 A "전체 보기" → /entries 결합 회귀 잠금 (시나리오 10, 결정 로그 008 §H).
 *
 * dashboard.spec.ts 시나리오 6 이 "클릭 → /entries 로 이동" 만 잠갔다.
 * 본 슬라이스에서 /entries 페이지가 실제로 결합되면서 다음 두 가지를 더 묶어 검증한다:
 *   - 위젯 A 에 노출된 메모(getRecentEntries 결과) 가 /entries 페이지(listEntriesFiltered 결과)에도 같은 의미로 보인다.
 *     → worker 가 두 query 를 한 본체로 합치든(getRecentEntries 가 listEntriesFiltered 로 위임) 아니든,
 *       사용자 가시 결과의 정합성은 본 spec 이 보장.
 *   - "전체 보기" anchor 자체가 정확히 /entries 로 가는 anchor 다 (href 직접 검증).
 *
 * 사전 가정 (worker 결합):
 *   - 대시보드 위젯 A 가 `getRecentEntries(5)` 결과를 렌더.
 *   - /entries 가 `listEntriesFiltered({sort:"recent"})` 결과를 렌더.
 *   - 두 query 가 같은 데이터 소스(본인 user_id + friends.is_deleted=false + 동일 정렬 규약) 위에서 동작.
 *
 * 본 spec 은 dashboard.spec.ts 와 중복 의도가 아니다 — 후자는 page 이동, 본 spec 은 데이터 정합 + href.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

async function createFriend(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  await page.goto("/friends");
  await page.getByRole("button", { name: /친구 추가/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/이름/).fill(name);
  await dialog.getByRole("button", { name: /친구 추가/ }).click();
  await expect(dialog).toBeHidden();
}

async function createEntryForFriend(
  page: import("@playwright/test").Page,
  friendName: string,
  memo: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "친구 선택" }).click();
  await page.getByRole("textbox", { name: "친구 이름 검색" }).fill(friendName);
  await page.getByRole("option", { name: new RegExp(friendName) }).click();

  await dialog.getByLabel(/내용 메모/).fill(memo);
  await dialog.getByRole("button", { name: "신세 추가하기" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("위젯 A → /entries 결합", () => {
  test("[시나리오 10] 위젯 A '전체 보기' anchor 의 href 는 /entries 이고, 위젯에 보였던 메모가 /entries 페이지에도 그대로 보인다", async ({
    page,
  }) => {
    const friend = uniqueName("위젯전체보기친구");
    const memo = uniqueName("위젯전체보기메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    // 대시보드에서 위젯 A 에 메모가 보인다.
    await page.goto("/");
    await expect(page.getByText(memo, { exact: false })).toBeVisible();

    // "전체 보기" link 의 href 가 /entries 직접 매칭.
    const viewAll = page.getByRole("link", { name: "받은 신세 전체 보기" });
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute("href", "/entries");

    // 클릭 → /entries 진입 → 같은 메모가 결과 리스트에 노출.
    await viewAll.click();
    await page.waitForURL(/\/entries$/);
    expect(new URL(page.url()).pathname).toBe("/entries");

    const list = page.locator("#entries-list");
    await expect(list).toBeVisible();
    await expect(list.getByText(memo, { exact: false })).toBeVisible();
  });
});
