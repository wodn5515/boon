import { expect, test } from "@playwright/test";

import { authenticatedStorageState } from "../fixtures/auth";

/**
 * 친구 관리 CRUD E2E (PRD §3, §5 - friends-crud 슬라이스).
 *
 * 검증 시나리오:
 *   1. /friends 진입 → "친구 목록" 헤딩 + (빈 상태 또는 카드)
 *   2. "친구 추가" → 모달 → 이름·생일·메모 입력 → 저장 → 카드 추가
 *   3. 친구 카드 클릭 → /friends/[id] 이동 → 이름·생일 표시
 *   4. 상세에서 "수정" → 모달 → 이름 변경 → 저장 → 새 이름 반영
 *   5. 상세에서 "삭제" → 확인 모달 → 삭제 → /friends 로 redirect → 카드 사라짐
 *   6. 검색 박스에 부분 이름 입력 → 매칭 카드만 표시
 *
 * 인증: 모든 시나리오가 인증 fixture 적용 (storageState).
 *
 * 사전 가정 (worker 가 결합):
 *   - /friends 가 drizzle 쿼리(listFriends)로 본인 user_id 친구 목록을 보여준다
 *   - "친구 추가" 모달 폼은 Server Action(createFriend)에 결합되어 있고
 *     저장 성공 시 모달이 닫히며 목록이 revalidate 된다
 *   - 친구 카드는 /friends/[id] 로 가는 <a>/<Link> 다 (디자이너 골격 그대로)
 *   - 상세 페이지의 "수정"/"삭제" 버튼은 각각 updateFriend / deleteFriend 액션에 결합
 *   - deleteFriend 는 soft delete + /friends 로 redirect
 *   - 검색은 입력 시 클라이언트 또는 서버 필터로 매칭 카드만 보여준다
 *
 * 테스트 격리:
 *   - 각 시나리오 시작 시 고유 suffix(테스트 ID)로 친구 이름을 만들어
 *     병렬/재실행 간 충돌을 피한다.
 *   - 시드 친구 데이터가 있더라도 우리가 만든 이름이 곁다리에 같이 나오지 않도록
 *     "테스트친구-<8자랜덤>" 형태로 충분히 유일하게 만든다.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix = "테스트친구"): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${suffix}`;
}

test.describe("/friends 친구 관리", () => {
  test("[시나리오 1] /friends 진입 시 '친구 목록' 헤딩이 보인다", async ({
    page,
  }) => {
    await page.goto("/friends");

    await expect(
      page.getByRole("heading", { name: "친구 목록", level: 1 }),
    ).toBeVisible();
    // 빈 상태든 카드가 있든 한 가지 흐름은 반드시 노출되어야 한다.
    // (둘 다 부재 = 페이지가 죽었다는 뜻 = 실패)
    const addButton = page.getByRole("button", { name: /친구 추가/ }).first();
    await expect(addButton).toBeVisible();
  });

  test("[시나리오 2] '친구 추가' 모달로 새 친구를 만들면 목록에 카드가 추가된다", async ({
    page,
  }) => {
    const name = uniqueName();
    await page.goto("/friends");

    await page.getByRole("button", { name: /친구 추가/ }).first().click();

    // 모달 열림 확인.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("친구 추가", { exact: true })).toBeVisible();

    // 이름 입력.
    await dialog.getByLabel(/이름/).fill(name);

    // 생일 3/5 선택 (Select 두 개).
    // friend-form-dialog 의 SelectTrigger 에는 placeholder "월", "일" 이 들어 있다.
    // "5일" 은 "15일"·"25일" 의 substring 매칭 회피를 위해 exact:true 로 강화.
    // 이 strict 매처가 통과한다는 것은 worker 가 sino-Korean(십오일/이십오일) hack 없이도
    // ListItem 접근성 이름이 유일함을 보장한다는 뜻이다.
    await dialog.getByRole("combobox", { name: /월/ }).click();
    await page.getByRole("option", { name: "3월", exact: true }).click();
    await dialog.getByRole("combobox", { name: /일/ }).click();
    await page.getByRole("option", { name: "5일", exact: true }).click();

    // 메모 입력.
    await dialog.getByLabel(/메모/).fill("E2E 시나리오 2 - 자동 생성");

    // 저장.
    await dialog.getByRole("button", { name: /친구 추가/ }).click();

    // 저장 성공 시 모달이 닫혀야 한다.
    await expect(dialog).toBeHidden();

    // 새 친구 카드가 목록에 나타나야 한다 (이름이 곧 식별자).
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  });

  test("[시나리오 3] 친구 카드 클릭 시 /friends/[id] 로 이동해 이름·생일이 보인다", async ({
    page,
  }) => {
    const name = uniqueName();
    await page.goto("/friends");

    // 사전 준비: 친구 한 명 만든다.
    await page.getByRole("button", { name: /친구 추가/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/이름/).fill(name);
    await dialog.getByRole("combobox", { name: /월/ }).click();
    await page.getByRole("option", { name: "7월" }).click();
    await dialog.getByRole("combobox", { name: /일/ }).click();
    await page.getByRole("option", { name: "20일" }).click();
    await dialog.getByRole("button", { name: /친구 추가/ }).click();
    await expect(dialog).toBeHidden();

    // 카드 클릭 → 상세 페이지.
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // 상세 페이지에 이름 + 생일이 보인다.
    await expect(
      page.getByRole("heading", { name, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("7월 20일")).toBeVisible();
  });

  test("[시나리오 4] 상세 페이지에서 이름을 수정하면 즉시 반영된다", async ({
    page,
  }) => {
    const originalName = uniqueName("수정전");
    const newName = uniqueName("수정후");

    await page.goto("/friends");

    // 사전: 친구 생성.
    await page.getByRole("button", { name: /친구 추가/ }).first().click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/이름/).fill(originalName);
    await createDialog.getByRole("button", { name: /친구 추가/ }).click();
    await expect(createDialog).toBeHidden();

    await page.getByRole("link", { name: new RegExp(originalName) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // 수정 모달 열기.
    await page.getByRole("button", { name: "친구 정보 수정" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByText("친구 정보 수정")).toBeVisible();

    // 이름 변경.
    const nameInput = editDialog.getByLabel(/이름/);
    await nameInput.fill(newName);
    await editDialog.getByRole("button", { name: /수정 저장/ }).click();

    await expect(editDialog).toBeHidden();

    // 상세 페이지 헤딩이 새 이름으로 갱신.
    await expect(
      page.getByRole("heading", { name: newName, level: 1 }),
    ).toBeVisible();
  });

  test("[시나리오 5] 상세에서 삭제하면 /friends 로 돌아가고 카드가 사라진다", async ({
    page,
  }) => {
    const name = uniqueName("삭제대상");

    await page.goto("/friends");

    // 사전: 친구 생성.
    await page.getByRole("button", { name: /친구 추가/ }).first().click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/이름/).fill(name);
    await createDialog.getByRole("button", { name: /친구 추가/ }).click();
    await expect(createDialog).toBeHidden();

    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // 삭제 모달 열기 → 확인.
    await page.getByRole("button", { name: "친구 삭제" }).click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "삭제", exact: true }).click();

    // /friends 목록 페이지로 돌아온다.
    await page.waitForURL("**/friends");
    expect(new URL(page.url()).pathname).toBe("/friends");

    // 삭제된 친구 카드는 더 이상 보이지 않는다 (soft delete 이지만 목록에서 제외).
    await expect(
      page.getByRole("link", { name: new RegExp(name) }),
    ).toHaveCount(0);
  });

  test("[시나리오 6] 검색 박스에 부분 이름을 입력하면 매칭 카드만 보인다", async ({
    page,
  }) => {
    const keepName = uniqueName("검색매칭");
    const dropName = uniqueName("다른친구");

    await page.goto("/friends");

    // 두 명 생성.
    for (const n of [keepName, dropName]) {
      await page.getByRole("button", { name: /친구 추가/ }).first().click();
      const d = page.getByRole("dialog");
      await d.getByLabel(/이름/).fill(n);
      await d.getByRole("button", { name: /친구 추가/ }).click();
      await expect(d).toBeHidden();
    }

    // 검색 박스에 keepName 의 고유 접두사 입력.
    const search = page.getByRole("searchbox", { name: /친구 이름 검색/ });
    await search.fill("검색매칭");

    // 매칭 카드만 보이고 비매칭은 사라진다.
    await expect(
      page.getByRole("link", { name: new RegExp(keepName) }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(dropName) }),
    ).toHaveCount(0);
  });
});
