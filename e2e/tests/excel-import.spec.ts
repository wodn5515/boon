import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * `/entries/import` 엑셀 일괄 가져오기 5단계 워크플로우 E2E (PRD §3, D-016, D-026, 결정 로그 009).
 *
 * 검증 시나리오 (test-writer 라운드 명세):
 *   1. /entries → "엑셀 가져오기" 버튼 클릭 → /entries/import 로 진입 (PR #7 🟢 #2 청산 검증)
 *   2. Step 1 mock 시연 버튼 → Step 2 진행
 *   3. Step 2 컬럼 자동 감지 + 사용자 매핑 변경 → Step 3
 *   4. Step 3 이벤트명·날짜·카테고리·보답 시점 입력 → Step 4
 *   5. Step 4 매칭 검토 (0건/1건/다건) — D-026 명시 "같은 사람" 확인
 *   6. Step 5 미리보기 + 실행 → /entries 로 redirect + "N건 추가됨" 토스트
 *
 * 사전 가정 (worker 가 결합):
 *   - lib/import/queries.ts::matchFriendsByName / bulkImportEntries 본격 SQL 결합 완료
 *     (정정-1 패턴 + LEFT JOIN LATERAL friend note/recent entry, 단일 트랜잭션 dedup + 카테고리 cross-check).
 *   - app/(authenticated)/entries/import/page.tsx 가 matchAction / bulkImportAction props 를
 *     실제 server action 으로 결합해 ImportWizard 에 주입.
 *   - 성공 후 redirect: `/entries?imported=N` (디자이너 ImportWizard 골격) — 본 spec 은
 *     querystring 의 imported 값을 토스트/배너로 노출하라는 의미 잠금 (worker 가 자연스럽게 toast UI 결합).
 *   - E2E_BYPASS_AUTH=1 분기에서 matchFriendsByName / bulkImportEntries 가 e2e-store 위에서 동작.
 *
 * 테스트 격리:
 *   - test-with-reset 가 매 테스트 직전 e2e-store 비움.
 *   - 친구·메모는 unique suffix 로 다른 시드 잔존과 충돌 회피.
 *
 * 디자이너 mock 의존 회피:
 *   - 본 spec 은 mock 흐름(`MOCK_EXCEL_ROWS` "김민준" 등 가상 데이터) 을 일부 활용 — worker 가
 *     matchAction 결합 후에도 mock 시연 버튼은 살아 있다 (Step 1 footer 의 "예시 파일로 흐름 살펴보기").
 *     단, 매칭/실행은 mock 분기가 아니라 server action 결합 결과를 검증한다 — Step 5 실행 후
 *     /entries 페이지의 EntryItem 실 데이터에 unique 메모가 나오는지를 본질로 잠근다.
 *   - mock 시연 버튼이 worker 결합 후 제거된 경우 spec 6 시나리오는 실 .xlsx 파일 업로드로 대체 가능 —
 *     Lead 결정 로그에 반영 후 spec 수정.
 */

test.use({ storageState: authenticatedStorageState() });

function uniqueName(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

/**
 * /friends 페이지에서 친구 한 명을 생성한다 (기존 entries-list.spec 패턴 그대로).
 * Step 4 매칭 검토 시 본인 친구 풀에 있는 이름을 매칭시키기 위함.
 */
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

test.describe("/entries/import 엑셀 일괄 가져오기 5단계 워크플로우", () => {
  // ============================================================
  // 시나리오 1 — /entries → "엑셀 가져오기" 버튼 → /entries/import 진입 (PR #7 🟢 #2 청산)
  // ============================================================
  test("[시나리오 1] /entries 의 '엑셀 가져오기' 버튼은 placeholder anchor 가 아니라 본격 Link 로 /entries/import 에 진입한다", async ({
    page,
  }) => {
    await page.goto("/entries");

    // /entries 의 "엑셀 가져오기" 버튼은 본격 Link (asChild + Link href).
    // placeholder anchor (`<a href="#">`) 였다면 클릭해도 같은 페이지에 머문다.
    const importBtn = page.getByRole("link", { name: /엑셀 가져오기/ });
    await expect(importBtn).toBeVisible();
    await expect(importBtn).toHaveAttribute("href", "/entries/import");

    await importBtn.click();
    await page.waitForURL("**/entries/import");
    expect(new URL(page.url()).pathname).toBe("/entries/import");

    // import 페이지의 H1 + 5단계 stepper.
    await expect(
      page.getByRole("heading", { name: "엑셀 가져오기", level: 1 }),
    ).toBeVisible();
    // stepper 의 첫 단계명 — ImportStepper 디자이너 골격이 노출하는 라벨.
    // 정확한 라벨은 worker 가 IMPORT_STEPS 손대지 않는 한 "엑셀 업로드" 톤이 유지된다.
    // 라벨 변동에 강하도록 "업로드" 키워드만 잠근다.
    await expect(page.getByText(/업로드/).first()).toBeVisible();
  });

  // ============================================================
  // 시나리오 2 — Step 1 mock 시연 버튼 → Step 2 진행
  // ============================================================
  test("[시나리오 2] Step 1 '예시 파일로 흐름 살펴보기' 버튼 → Step 2 컬럼 매핑 단계로 진행", async ({
    page,
  }) => {
    await page.goto("/entries/import");

    // Step 1: 드롭존 + mock 시연 버튼.
    await expect(
      page.getByRole("button", { name: /엑셀 파일 업로드 영역/ }),
    ).toBeVisible();
    const mockBtn = page.getByRole("button", { name: /예시 파일로 흐름 살펴보기/ });
    await expect(mockBtn).toBeVisible();
    await mockBtn.click();

    // Step 2 진입 — "이름·금액·비고" 슬롯 select 들.
    await expect(
      page.getByRole("combobox", { name: /이름 컬럼/ }),
    ).toBeVisible();
    // "다음 — 일괄 설정" 버튼이 보인다 (자동 감지 후 "이름" 선택돼 있어 활성).
    const nextBtn = page.getByRole("button", { name: /일괄 설정/ });
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeEnabled();
  });

  // ============================================================
  // 시나리오 3 — Step 2 컬럼 자동 감지 + 사용자 매핑 변경 → Step 3
  // ============================================================
  test("[시나리오 3] Step 2 자동 감지 → 사용자가 매핑 변경 가능 → Step 3 진행", async ({
    page,
  }) => {
    await page.goto("/entries/import");
    await page.getByRole("button", { name: /예시 파일로 흐름 살펴보기/ }).click();

    // 자동 감지 배지 — "이름·금액·비고" 3슬롯 모두 자동 감지되어 있다 (MOCK_EXCEL_HEADERS 정합).
    // ColumnSlot 의 자동 감지 배지 aria-label="자동 감지된 컬럼".
    const autoBadges = page.locator('[aria-label="자동 감지된 컬럼"]');
    await expect(autoBadges).toHaveCount(3);

    // 사용자가 비고 슬롯을 "매핑 안 함" 으로 변경 — Radix Select trigger 클릭 후 option.
    await page.getByRole("combobox", { name: /비고·메모 컬럼/ }).click();
    await page.getByRole("option", { name: /매핑 안 함/ }).click();

    // Step 3 으로.
    await page.getByRole("button", { name: /일괄 설정/ }).click();

    // Step 3 진입 — 이벤트명 input + 카테고리 select.
    await expect(page.getByLabel(/이벤트명/)).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "카테고리" }),
    ).toBeVisible();
  });

  // ============================================================
  // 시나리오 4 — Step 3 이벤트명·날짜·카테고리·보답 시점 입력 → Step 4 매칭 검토
  // ============================================================
  test("[시나리오 4] Step 3 일괄 설정 입력 → Step 4 친구 매칭 검토 진입", async ({
    page,
  }) => {
    // Step 4 매칭 검토는 본인 친구 풀과 비교한다.
    // mock excel 의 "이서윤" 이 본인 친구에 있어야 1건 매칭이 노출된다.
    await createFriend(page, "이서윤");

    await page.goto("/entries/import");
    await page.getByRole("button", { name: /예시 파일로 흐름 살펴보기/ }).click();
    // Step 2 → Step 3
    await page.getByRole("button", { name: /일괄 설정/ }).click();

    // Step 3 입력.
    const eventName = uniqueName("결혼식축의금");
    await page.getByLabel(/이벤트명/).fill(eventName);
    // 받은 날짜는 기본 = 오늘. 그대로 둔다.
    // 카테고리·보답 시점도 디폴트 그대로.

    await page.getByRole("button", { name: /친구 매칭 검토/ }).click();

    // Step 4 진입 — "한 명씩 살펴보세요" 안내 + row 카드들.
    await expect(
      page.getByText(/한 명씩 살펴보세요/),
    ).toBeVisible();
    // 일괄 액션 헤더 "전체 포함" + counter.
    await expect(page.getByText(/전체 포함/)).toBeVisible();
    // "다음 — 미리보기 (N건)" 버튼.
    await expect(
      page.getByRole("button", { name: /미리보기 \(\d+건\)/ }),
    ).toBeVisible();
  });

  // ============================================================
  // 시나리오 5 — Step 4 매칭 검토 (0건/1건/다건) — D-026 "같은 사람" 명시 확인
  // ============================================================
  test("[시나리오 5] Step 4 — 0건 매칭은 '새 친구로 추가' 자동, 1건 매칭은 '같은 사람' 초기 미체크 (D-026)", async ({
    page,
  }) => {
    // 본인 친구 풀에 mock excel 의 "이서윤" 1명을 추가 — 단일 매칭 후보 1건.
    // "박도윤"·"정하준"·"박지호" 는 친구 풀에 없음 → 0건 매칭 (새 친구).
    await createFriend(page, "이서윤");

    await page.goto("/entries/import");
    await page.getByRole("button", { name: /예시 파일로 흐름 살펴보기/ }).click();
    await page.getByRole("button", { name: /일괄 설정/ }).click();
    await page.getByLabel(/이벤트명/).fill(uniqueName("이벤트"));
    await page.getByRole("button", { name: /친구 매칭 검토/ }).click();

    // 0건 매칭 — "새 친구로 추가" 배지. mock 의 "박도윤" / "정하준" / "박지호" 가 해당.
    // 배지 aria-label = "매칭 결과: 새 친구로 추가".
    const newBadges = page.locator('[aria-label="매칭 결과: 새 친구로 추가"]');
    await expect(newBadges.first()).toBeVisible();

    // 1건 매칭 — "1명 매칭" 배지 + "같은 사람" 체크박스 (초기 unchecked, D-026).
    const singleBadge = page.locator('[aria-label="매칭 결과: 1명 매칭"]').first();
    await expect(singleBadge).toBeVisible();

    // 단일 매칭 카드 안의 "같은 사람 확인" 체크박스 — 초기 미체크.
    const sameCheckbox = page
      .getByRole("checkbox", { name: /같은 사람 확인/ })
      .first();
    await expect(sameCheckbox).toBeVisible();
    await expect(sameCheckbox).not.toBeChecked();

    // 체크하면 "같은 사람" 배지로 라벨 변경 (디자이너 RowReviewCard 로직).
    await sameCheckbox.click();
    await expect(sameCheckbox).toBeChecked();
    await expect(
      page.locator('[aria-label="매칭 결과: 같은 사람"]').first(),
    ).toBeVisible();
  });

  // ============================================================
  // 시나리오 6 — Step 5 실행 → /entries redirect + N건 토스트/배너
  // ============================================================
  test("[시나리오 6] Step 5 '가져오기 실행' → /entries 로 redirect + N건 추가됨 안내", async ({
    page,
  }) => {
    // 본 시나리오는 worker 결합 후 server action 으로 실제 entries 가 들어가는지 본질을 잠근다.
    // mock 시연 버튼을 거치되 실행은 bulkImportAction (server action) 으로 떨어진다고 가정.
    await page.goto("/entries/import");
    await page.getByRole("button", { name: /예시 파일로 흐름 살펴보기/ }).click();
    await page.getByRole("button", { name: /일괄 설정/ }).click();
    const eventName = uniqueName("결혼식");
    await page.getByLabel(/이벤트명/).fill(eventName);
    await page.getByRole("button", { name: /친구 매칭 검토/ }).click();
    await page.getByRole("button", { name: /미리보기 \(\d+건\)/ }).click();

    // Step 5 — "가져오기 실행 (N건)" 버튼.
    const confirmBtn = page.getByRole("button", { name: /가져오기 실행/ });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // /entries 로 navigate — querystring 에 imported=N (디자이너 ImportWizard 골격).
    await page.waitForURL("**/entries?imported=*");
    expect(new URL(page.url()).pathname).toBe("/entries");
    const imported = new URL(page.url()).searchParams.get("imported");
    expect(imported).not.toBeNull();
    expect(Number(imported)).toBeGreaterThan(0);

    // 추가된 entry 가 entries 리스트에 노출되어 있다 — eventName 메모 prefix 로 검증.
    // worker 가 bulkImportEntries 트랜잭션 결합 시 memo 빌더로 "이벤트명 · 친구이름 · ..." 를 만들어
    // 모든 새 entry 에 eventName 가 들어간다.
    // (mock 시연 분기로는 router.push 만 일어나고 실 entries 는 추가되지 않으므로 본 검증이
    //  worker 결합 의무를 잠근다.)
    const list = page.locator("#entries-list");
    await expect(list).toBeVisible();
    await expect(list.getByText(eventName, { exact: false }).first()).toBeVisible();
  });
});
