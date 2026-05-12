import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * 친구 상세 페이지 × 받은 신세 타임라인 결합 E2E (PRD §3 — entries-crud 슬라이스).
 *
 * 검증 시나리오:
 *   5. /friends/[id] 진입 → "받은 신세 타임라인" 헤딩 + (빈 상태 또는 카드)
 *   6. 친구 상세 "신세 추가" 버튼 → defaultFriendId 가 미리 선택된 EntryFormDialog 가 열린다
 *      (친구 combobox 트리거가 해당 친구 이름을 이미 표시).
 *
 * 인증: storageState (authenticated fixture).
 *
 * 사전 가정 (worker 가 결합):
 *   - `/friends/[id]` 가 listEntriesByFriend(friend.id) drizzle 쿼리에 결합되어
 *     mock_entries 미주입 시에도 진입은 가능 (빈 상태 노출).
 *   - EntryFormDialog 의 defaultFriendId 가 트리거 라벨에 친구 이름으로 표시된다.
 *   - 디자이너 골격에서 친구 상세의 "신세 추가" 버튼 aria-label = `${friend.name}한테 받은 신세 추가`.
 *
 * 회귀 비고: 시나리오 9 (비로그인 → /login) 는 friends-redirect.spec.ts 에서 이미 커버.
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

test.describe("/friends/[id] 받은 신세 타임라인", () => {
  test("[시나리오 5] 친구 상세 진입 시 '받은 신세 타임라인' 섹션이 노출된다", async ({
    page,
  }) => {
    const friendName = uniqueName("타임라인친구");
    await createFriend(page, friendName);

    await page.goto("/friends");
    await page.getByRole("link", { name: new RegExp(friendName) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // 친구 이름 헤딩.
    await expect(
      page.getByRole("heading", { name: friendName, level: 1 }),
    ).toBeVisible();

    // 받은 신세 타임라인 섹션 헤딩.
    await expect(
      page.getByRole("heading", { name: "받은 신세 타임라인", level: 2 }),
    ).toBeVisible();
  });

  test("[시나리오 6] 친구 상세의 '신세 추가' 버튼 → defaultFriendId 가 미리 선택된 EntryFormDialog 가 열린다", async ({
    page,
  }) => {
    const friendName = uniqueName("미리선택친구");
    await createFriend(page, friendName);

    await page.goto("/friends");
    await page.getByRole("link", { name: new RegExp(friendName) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // 친구별 "신세 추가" 버튼 클릭 — aria-label 패턴 `${name}한테 받은 신세 추가`.
    await page
      .getByRole("button", { name: new RegExp(`${friendName}한테 받은 신세 추가`) })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("신세 추가", { exact: true }),
    ).toBeVisible();

    // 친구 combobox 트리거에 현재 친구 이름이 이미 선택 표기되어 있어야 한다 (defaultFriendId).
    await expect(
      dialog.getByRole("combobox", { name: "친구 선택" }),
    ).toContainText(friendName);
  });
});
