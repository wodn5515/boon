import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * 신세(entries) CRUD E2E (PRD §3 — entries-crud 슬라이스).
 *
 * 검증 시나리오:
 *   1. 메인 FAB 클릭 → EntryFormDialog 열림 → 친구·카테고리·메모·날짜·보답 시점 입력 → 저장 → 모달 닫힘
 *   2. 친구 combobox 자동완성: 부분 이름 입력 → 매칭 카드 노출 → 선택
 *   3. 인라인 친구 빠른 생성: 없는 이름 입력 → "+ 새 친구로 추가" 클릭 → 친구 자동 선택 →
 *      entry 저장 → 새 친구도 /friends 목록에 추가됨
 *   4. 보답 시점 "특정 날짜": select → "특정 날짜" 선택 → 아래 date picker 노출 → 날짜 입력
 *   7. entry 수정: EntryItem 수정 버튼 → 모달 → 메모 변경 → 저장 → 타임라인에 반영
 *   8. entry 삭제: EntryItem 삭제 → 확인 모달 → hard delete → 카드 사라짐
 *
 * 인증: 모든 시나리오가 인증 fixture (storageState).
 *
 * 사전 가정 (worker 가 결합):
 *   - 메인 페이지(`/`) FAB 가 createEntry Server Action 에 결합되어 있다
 *     (디자이너 골격 `components/ui/quick-add-fab.tsx` 의 onSubmitAction prop).
 *   - EntryFormDialog 의 친구 combobox 는 listFriends() 결과로 구성된다.
 *   - 인라인 친구 빠른 생성은 createEntry 가 friend + entry 한 트랜잭션으로 처리.
 *   - "특정 날짜" 분기는 select 변경 시 date picker 가 인라인 노출 (디자이너 골격 그대로).
 *   - 친구 상세 페이지의 EntryItem 수정·삭제 버튼이 updateEntry / deleteEntry 에 결합.
 *
 * 테스트 격리: 메모·친구 이름에 unique suffix 를 붙여 병렬/재실행 충돌 방지.
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

test.describe("entries(신세) CRUD", () => {
  test("[시나리오 1] 메인 FAB 으로 신세 추가 — 친구·카테고리·메모·날짜·보답 시점 입력 → 저장 → 모달 닫힘", async ({
    page,
  }) => {
    // 사전: 친구 한 명을 만들어 둔다 (combobox 가 빈 목록일 때 인라인 빠른 생성으로 바로 가지 않게).
    const friendName = uniqueName("FAB친구");
    await createFriend(page, friendName);

    const memo = uniqueName("FAB-메모");

    await page.goto("/");
    // FAB 클릭 — aria-label = "신세 빠르게 추가" (디자이너 골격 그대로).
    await page.getByRole("button", { name: "신세 빠르게 추가" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("신세 추가", { exact: true })).toBeVisible();

    // 친구 combobox — 트리거 (aria-label "친구 선택") 클릭 후 친구 이름으로 검색·선택.
    await dialog.getByRole("combobox", { name: "친구 선택" }).click();
    const popoverSearch = page.getByRole("textbox", { name: "친구 이름 검색" });
    await popoverSearch.fill(friendName);
    await page.getByRole("option", { name: new RegExp(friendName) }).click();

    // 카테고리는 기본 선택을 그대로 둔다 (시드된 첫 카테고리).
    // 메모 입력.
    await dialog.getByLabel(/내용 메모/).fill(memo);
    // 받은 날짜는 기본값(오늘) 유지.
    // 보답 시점 기본값(언제든) 유지.

    // 저장.
    await dialog.getByRole("button", { name: "신세 추가하기" }).click();

    // 모달이 닫힌다 = 저장 성공의 가시 신호.
    await expect(dialog).toBeHidden();
  });

  test("[시나리오 2] 친구 combobox 자동완성 — 부분 이름 매칭 → 선택", async ({
    page,
  }) => {
    const friendName = uniqueName("자동완성");
    await createFriend(page, friendName);

    await page.goto("/");
    await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox", { name: "친구 선택" }).click();
    const search = page.getByRole("textbox", { name: "친구 이름 검색" });

    // 친구 이름 첫 2글자만 입력 → ilike 매칭.
    await search.fill(friendName.slice(0, 4));

    // 매칭 option 이 노출되어 있어야 한다.
    const option = page.getByRole("option", { name: new RegExp(friendName) });
    await expect(option).toBeVisible();
    await option.click();

    // 트리거 라벨에 친구 이름이 채워졌다 (조합박스 자체 텍스트).
    await expect(
      dialog.getByRole("combobox", { name: "친구 선택" }),
    ).toContainText(friendName);
  });

  test("[시나리오 3] 인라인 친구 빠른 생성 — 없는 이름 → '+ 새 친구로 추가' → entry 저장 → /friends 에 새 친구도 추가됨", async ({
    page,
  }) => {
    const newName = uniqueName("정민호");
    const memo = uniqueName("인라인-메모");

    await page.goto("/");
    await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // combobox 열고 없는 이름 입력 → "+ 'newName' 새 친구로 추가" 버튼이 마지막에 노출.
    await dialog.getByRole("combobox", { name: "친구 선택" }).click();
    await page.getByRole("textbox", { name: "친구 이름 검색" }).fill(newName);

    // 디자이너 골격: 텍스트 = "'{name}' 새 친구로 추가" (홑따옴표는 ‘’ 라 raw quote 가 아닌 부분 매칭).
    const addNewBtn = page.getByRole("button", {
      name: new RegExp(`${newName}.*새 친구로 추가`),
    });
    await expect(addNewBtn).toBeVisible();
    await addNewBtn.click();

    // 트리거에 "정민호 (새 친구)" 같은 라벨이 표시된다.
    await expect(
      dialog.getByRole("combobox", { name: "친구 선택" }),
    ).toContainText(newName);

    // 메모 채우고 저장.
    await dialog.getByLabel(/내용 메모/).fill(memo);
    await dialog.getByRole("button", { name: "신세 추가하기" }).click();
    await expect(dialog).toBeHidden();

    // /friends 목록에 새 친구가 등장한다.
    await page.goto("/friends");
    await expect(
      page.getByRole("link", { name: new RegExp(newName) }),
    ).toBeVisible();
  });

  test("[시나리오 4] 보답 시점 '특정 날짜' 선택 시 date picker 가 인라인 노출되고 날짜를 입력할 수 있다", async ({
    page,
  }) => {
    const friendName = uniqueName("특정날짜");
    await createFriend(page, friendName);

    await page.goto("/");
    await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
    const dialog = page.getByRole("dialog");

    // 친구 선택.
    await dialog.getByRole("combobox", { name: "친구 선택" }).click();
    await page.getByRole("textbox", { name: "친구 이름 검색" }).fill(friendName);
    await page.getByRole("option", { name: new RegExp(friendName) }).click();
    await dialog.getByLabel(/내용 메모/).fill(uniqueName("특정날짜-메모"));

    // 처음에는 "갚을 날짜" picker 가 보이지 않는다 (anytime 기본).
    await expect(dialog.getByLabel("갚을 날짜")).toHaveCount(0);

    // 보답 시점 select → "특정 날짜".
    await dialog.getByRole("combobox", { name: "보답 시점" }).click();
    await page.getByRole("option", { name: "특정 날짜", exact: true }).click();

    // "갚을 날짜" date picker 가 노출된다.
    const datePicker = dialog.getByLabel("갚을 날짜");
    await expect(datePicker).toBeVisible();
    await datePicker.fill("2026-06-15");

    // 저장 → 모달 닫힘.
    await dialog.getByRole("button", { name: "신세 추가하기" }).click();
    await expect(dialog).toBeHidden();
  });

  test("[시나리오 7] EntryItem 수정 — 모달에서 메모 변경 → 저장 → 친구 상세 타임라인에 반영", async ({
    page,
  }) => {
    const friendName = uniqueName("수정대상친구");
    const originalMemo = uniqueName("원본메모");
    const newMemo = uniqueName("수정후메모");

    // 친구 생성 → 친구 상세 페이지로 이동.
    await createFriend(page, friendName);
    await page.goto("/friends");
    await page.getByRole("link", { name: new RegExp(friendName) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // "신세 추가" 버튼으로 entry 한 건 생성.
    await page
      .getByRole("button", { name: new RegExp(`${friendName}한테 받은 신세 추가`) })
      .first()
      .click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/내용 메모/).fill(originalMemo);
    await dialog.getByRole("button", { name: "신세 추가하기" }).click();
    await expect(dialog).toBeHidden();

    // 타임라인에 원본 메모 카드가 등장한다.
    await expect(page.getByText(originalMemo, { exact: false })).toBeVisible();

    // EntryItem 의 "신세 수정" 버튼 클릭 → 모달 열림 → 메모 변경.
    await page.getByRole("button", { name: "신세 수정" }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("신세 수정", { exact: true }),
    ).toBeVisible();

    const memoInput = dialog.getByLabel(/내용 메모/);
    await memoInput.fill(newMemo);
    await dialog.getByRole("button", { name: "수정 저장" }).click();
    await expect(dialog).toBeHidden();

    // 새 메모가 타임라인에 반영된다.
    await expect(page.getByText(newMemo, { exact: false })).toBeVisible();
    // 원본 메모는 사라진다.
    await expect(page.getByText(originalMemo, { exact: false })).toHaveCount(0);
  });

  test("[시나리오 8] EntryItem 삭제 — 확인 모달 → 삭제 → 카드 사라짐 (hard delete)", async ({
    page,
  }) => {
    const friendName = uniqueName("삭제대상친구");
    const memo = uniqueName("삭제대상메모");

    await createFriend(page, friendName);
    await page.goto("/friends");
    await page.getByRole("link", { name: new RegExp(friendName) }).click();
    await page.waitForURL(/\/friends\/[^/]+$/);

    // entry 생성.
    await page
      .getByRole("button", { name: new RegExp(`${friendName}한테 받은 신세 추가`) })
      .first()
      .click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/내용 메모/).fill(memo);
    await createDialog.getByRole("button", { name: "신세 추가하기" }).click();
    await expect(createDialog).toBeHidden();

    // 카드가 보이는지 먼저 확인.
    await expect(page.getByText(memo, { exact: false })).toBeVisible();

    // "신세 삭제" → 확인 모달 → 삭제.
    await page.getByRole("button", { name: "신세 삭제" }).first().click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await expect(
      deleteDialog.getByText("이 신세를 삭제하시겠어요?"),
    ).toBeVisible();
    await deleteDialog
      .getByRole("button", { name: "삭제", exact: true })
      .click();

    await expect(deleteDialog).toBeHidden();

    // 카드 사라짐.
    await expect(page.getByText(memo, { exact: false })).toHaveCount(0);
  });
});
