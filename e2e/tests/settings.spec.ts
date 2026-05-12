import { expect, test } from "@playwright/test";

import { authenticatedStorageState } from "../fixtures/auth";

/**
 * /settings 카테고리 관리 E2E (PRD §3, §5 — categories-crud 슬라이스).
 *
 * 검증 시나리오:
 *   1. /settings 진입 → "설정" 헤딩 + 기본 카테고리 3개 (💰 물질 / ⏰ 시간·행동 / 💝 마음)
 *   2. "카테고리 추가" → 모달 → 이름·아이콘·색상 입력 → 저장 → 카드 추가
 *   3. 사용자 카테고리 수정 → 모달 → 이름 변경 → 저장 → 새 이름 반영
 *   4. 시스템 카테고리 수정 모달 → 이름 input 활성 / 아이콘·색상 disabled
 *   5. 사용자 카테고리 삭제 → 확인 모달 → 삭제 버튼 → 카드 사라짐
 *   6. 시스템 카테고리에는 삭제 버튼이 노출되지 않음
 *   7. 사용자 카테고리 정렬 위/아래 버튼이 노출됨
 *   8. 로그아웃 → /login 이동
 *
 * 인증: 모든 시나리오 storageState 적용.
 *
 * 사전 가정 (worker 가 결합):
 *   - /settings 가 listCategories() 로 본인 user_id 카테고리 목록을 보여준다
 *   - 새 user 의 첫 callback 진입 시 기본 카테고리 3개가 자동 시드된다
 *   - createCategory / updateCategory / deleteCategory Server Action 본체가 작동한다
 *   - signOut Server Action 이 supabase.auth.signOut() + redirect('/login') 을 수행한다
 *
 * 테스트 격리:
 *   - 추가 카테고리 이름에 unique suffix 를 붙여 다른 시나리오·재실행과 충돌 회피.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix = "테스트카테고리"): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

test.describe("/settings 카테고리 관리", () => {
  test("[시나리오 1] /settings 진입 시 '설정' 헤딩 + 기본 카테고리 3개가 보인다", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "설정", level: 1 }),
    ).toBeVisible();

    // 기본 카테고리 3개. 이름은 PRD §4 + D-018 그대로.
    // 아이콘과 결합되어 한 줄로 표시되므로 이름 텍스트만 매칭한다.
    await expect(page.getByText("물질", { exact: true })).toBeVisible();
    await expect(page.getByText("시간·행동", { exact: true })).toBeVisible();
    await expect(page.getByText("마음", { exact: true })).toBeVisible();

    // "기본" 배지 (is_system=true 신호) 가 3개 보인다.
    const systemBadges = page.getByText("기본", { exact: true });
    await expect(systemBadges).toHaveCount(3);

    // 카테고리 추가 버튼.
    await expect(
      page.getByRole("button", { name: /카테고리 추가/ }).first(),
    ).toBeVisible();
  });

  test("[시나리오 2] '카테고리 추가' 모달로 새 카테고리를 만들면 목록에 카드가 추가된다", async ({
    page,
  }) => {
    const name = uniqueName("선물");
    await page.goto("/settings");

    await page
      .getByRole("button", { name: /카테고리 추가/ })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("카테고리 추가", { exact: true })).toBeVisible();

    // 이름 입력.
    await dialog.getByLabel(/이름/).fill(name);

    // 아이콘 입력 (이모지).
    await dialog.getByLabel(/아이콘/).fill("🎁");

    // 색상 선택 — 두 번째 칩(라임) 클릭.
    await dialog.getByRole("radio", { name: "라임" }).click();

    // 저장 (모달 내부 submit 버튼).
    await dialog.getByRole("button", { name: /카테고리 추가하기/ }).click();

    // 모달 닫힘.
    await expect(dialog).toBeHidden();

    // 새 카테고리 카드가 목록에 보인다.
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test("[시나리오 3] 사용자 카테고리 이름을 수정하면 즉시 반영된다", async ({
    page,
  }) => {
    const originalName = uniqueName("수정전");
    const newName = uniqueName("수정후");
    await page.goto("/settings");

    // 사전: 새 카테고리 생성.
    await page
      .getByRole("button", { name: /카테고리 추가/ })
      .first()
      .click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/이름/).fill(originalName);
    await createDialog
      .getByRole("button", { name: /카테고리 추가하기/ })
      .click();
    await expect(createDialog).toBeHidden();

    // 새로 만든 카테고리의 수정 버튼 클릭 (aria-label 패턴 `${name} 수정`).
    await page
      .getByRole("button", { name: `${originalName} 수정` })
      .click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await expect(
      editDialog.getByText("카테고리 수정", { exact: true }),
    ).toBeVisible();

    // 이름 변경 후 저장.
    const nameInput = editDialog.getByLabel(/이름/);
    await nameInput.fill(newName);
    await editDialog.getByRole("button", { name: /수정 저장/ }).click();

    await expect(editDialog).toBeHidden();

    // 새 이름이 보이고, 원본 이름은 사라진다.
    await expect(page.getByText(newName, { exact: true })).toBeVisible();
    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
  });

  test("[시나리오 4] 시스템 카테고리 수정 모달은 이름만 활성, 아이콘·색상은 비활성", async ({
    page,
  }) => {
    await page.goto("/settings");

    // 시스템 카테고리 "물질" 의 수정 버튼.
    await page.getByRole("button", { name: "물질 수정" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("카테고리 수정", { exact: true }),
    ).toBeVisible();

    // 이름 input 은 활성.
    const nameInput = dialog.getByLabel(/이름/);
    await expect(nameInput).toBeEnabled();

    // 아이콘 input 은 disabled.
    const iconInput = dialog.getByLabel(/아이콘/);
    await expect(iconInput).toBeDisabled();

    // 색상 칩 그리드의 라디오 버튼들은 모두 disabled.
    // (시스템 카테고리는 색상 변경 불가.)
    const colorRadios = dialog.getByRole("radio");
    const count = await colorRadios.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(colorRadios.nth(i)).toBeDisabled();
    }
  });

  test("[시나리오 5] 사용자 카테고리를 삭제하면 카드가 사라진다", async ({
    page,
  }) => {
    const name = uniqueName("삭제대상");
    await page.goto("/settings");

    // 사전: 새 카테고리 생성.
    await page
      .getByRole("button", { name: /카테고리 추가/ })
      .first()
      .click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/이름/).fill(name);
    await createDialog
      .getByRole("button", { name: /카테고리 추가하기/ })
      .click();
    await expect(createDialog).toBeHidden();

    // 삭제 버튼 클릭 → 확인 모달.
    await page.getByRole("button", { name: `${name} 삭제` }).click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();

    // entries 가 0개이므로 "삭제" 버튼 (exact:true 로 "이전 후 삭제" 와 분리).
    await deleteDialog
      .getByRole("button", { name: "삭제", exact: true })
      .click();

    await expect(deleteDialog).toBeHidden();

    // 카드 사라짐.
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  test("[시나리오 6] 시스템 카테고리에는 삭제 버튼이 노출되지 않는다", async ({
    page,
  }) => {
    await page.goto("/settings");

    // 시스템 카테고리 3개의 "삭제" aria-label 버튼이 0개.
    await expect(
      page.getByRole("button", { name: "물질 삭제" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "시간·행동 삭제" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "마음 삭제" }),
    ).toHaveCount(0);
  });

  test("[시나리오 7] 사용자 카테고리에는 위/아래 정렬 버튼이 노출된다 + 사용자 그룹의 첫 카테고리는 '위로 이동' 이 disabled (그룹 경계 — 005 🟡 #2)", async ({
    page,
  }) => {
    const firstName = uniqueName("첫번째사용자");
    const secondName = uniqueName("두번째사용자");
    await page.goto("/settings");

    // 사용자 카테고리 두 개 생성. createCategory 가 sort_order = MAX+1 로 append 한다.
    for (const n of [firstName, secondName]) {
      await page
        .getByRole("button", { name: /카테고리 추가/ })
        .first()
        .click();
      const createDialog = page.getByRole("dialog");
      await createDialog.getByLabel(/이름/).fill(n);
      await createDialog
        .getByRole("button", { name: /카테고리 추가하기/ })
        .click();
      await expect(createDialog).toBeHidden();
    }

    // 위/아래 화살표 버튼이 모두 노출된다 (CategoryItem 의 aria-label).
    await expect(
      page.getByRole("button", { name: `${firstName} 위로 이동` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `${firstName} 아래로 이동` }),
    ).toBeVisible();

    // 핵심 (005 사용자 리뷰 🟡 #2):
    //   사용자 그룹의 첫 카테고리(시스템 3개 다음, sort_order 최솟값) 의 "위로 이동" 버튼이 disabled.
    //   현재 settings/page.tsx 는 모든 카테고리에 대해 `i === 0` 으로 isFirst 를 매기므로
    //   사용자 첫 카테고리(전체 index 3)는 isFirst=false → disabled 가 아니다. worker 가
    //   settings/page.tsx 의 isFirst/isLast 계산을 그룹 경계 기준(시스템 그룹 / 사용자 그룹)으로
    //   고쳐야 본 assert 가 초록으로 변한다.
    await expect(
      page.getByRole("button", { name: `${firstName} 위로 이동` }),
    ).toBeDisabled();

    // 사용자 그룹의 마지막 카테고리는 "아래로 이동" 이 disabled.
    await expect(
      page.getByRole("button", { name: `${secondName} 아래로 이동` }),
    ).toBeDisabled();
  });

  test("[시나리오 8] 로그아웃 버튼을 누르면 /login 으로 이동한다", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: /로그아웃/ }).click();

    await page.waitForURL("**/login**");
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
