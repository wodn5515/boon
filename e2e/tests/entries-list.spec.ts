import { authenticatedStorageState } from "../fixtures/auth";
import { expect, test } from "../fixtures/test-with-reset";

/**
 * `/entries` 받은 신세 리스트·검색 페이지 E2E (PRD §3, §5, 결정 로그 008).
 *
 * 검증 시나리오 (test-writer 라운드 명세):
 *   1. /entries 진입 → "받은 신세" 타이틀 + 필터 바 + EntryItem 리스트 (실 데이터)
 *   2. 텍스트 검색 ?q=메모키워드 → 매칭 entries 만 표시
 *   3. 친구 필터 ?friend=<id> → 해당 친구 entries 만
 *   4. 카테고리 필터 ?category=<id> → 해당 카테고리만
 *   5. 날짜 범위 ?from=...&to=... → 그 범위 내만
 *   6. 정렬 ?sort=oldest → received_date ASC
 *   7. 필터 조합 ?q=X&friend=Y&category=Z&sort=oldest → 모두 적용
 *   8. 빈 상태 (필터 결과 없음) → "조건에 맞는 신세가 없어요" + 필터 초기화 CTA
 *   9. 빈 상태 (데이터 자체 없음) → "받은 신세가 없어요" + FAB 안내
 *  11. 필터 초기화 anchor 클릭 → /entries URL 로 reset
 *
 * 사전 가정 (worker 가 결합):
 *   - app/(authenticated)/entries/page.tsx 가 mock 호출(MOCK_ENTRIES / MOCK_FRIEND_OPTIONS /
 *     MOCK_CATEGORY_OPTIONS) 을 떼고 실제 query(listEntriesFiltered + listFriends + listCategories)
 *     로 결합되어 있다.
 *   - listEntriesFiltered 가 정정-1 (user_id) + friends.is_deleted=false + categories JOIN + 필터·정렬·limit
 *     를 본격 SQL 결합한 본체로 swap 되어 있다 (008 §F + lib/entries-list/queries.ts 주석).
 *   - E2E_BYPASS_AUTH=1 분기에서 listEntriesFiltered 가 e2e-store 위에서 같은 의미로 동작한다.
 *   - 친구 select 옵션은 mock 친구가 아니라 본인이 만든 친구로 채워진다.
 *
 * 테스트 격리:
 *   - test-with-reset 가 매 테스트 직전 e2e-store 비움.
 *   - 친구·메모 이름에 unique suffix 를 붙여 검색어 정확 매칭을 강제 (다른 사용자 시드와 충돌 회피).
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
  opts: { receivedDate?: string; categoryName?: string } = {},
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "신세 빠르게 추가" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "친구 선택" }).click();
  await page.getByRole("textbox", { name: "친구 이름 검색" }).fill(friendName);
  await page.getByRole("option", { name: new RegExp(friendName) }).click();

  if (opts.categoryName) {
    // 카테고리 select — radix Select 라 trigger 클릭 후 option 선택.
    // entry-form-dialog 의 SelectTrigger aria-label="카테고리".
    await dialog.getByRole("combobox", { name: "카테고리" }).click();
    await page
      .getByRole("option", { name: new RegExp(opts.categoryName) })
      .click();
  }

  await dialog.getByLabel(/내용 메모/).fill(memo);

  if (opts.receivedDate) {
    // entry-form-dialog 의 받은 날짜 input — type=date, label "받은 날짜".
    const dateInput = dialog.getByLabel(/받은 날짜/);
    await dateInput.fill(opts.receivedDate);
  }

  await dialog.getByRole("button", { name: "신세 추가하기" }).click();
  await expect(dialog).toBeHidden();
}

/**
 * /entries 의 `<li data-entry-id>` 중 display:none 이 아닌(=실제로 보이는) 카드의 메모 텍스트만 모은다.
 * 즉시 클라이언트 필터(`display:none` 토글) 또는 서버 필터 결과 모두 동일 의미를 만족.
 */
async function visibleMemos(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  return page.evaluate(() => {
    const list = document.getElementById("entries-list");
    if (!list) return [];
    const lis = list.querySelectorAll<HTMLLIElement>("li[data-entry-id]");
    const out: string[] = [];
    lis.forEach((li) => {
      if (li.style.display === "none") return;
      const memo = (li.dataset.memo ?? "").trim();
      if (memo.length > 0) out.push(memo);
    });
    return out;
  });
}

test.describe("/entries 받은 신세 리스트·검색", () => {
  test("[시나리오 1] /entries 진입 시 '받은 신세' 타이틀 + 필터 바 + EntryItem 리스트가 모두 보인다 (실 데이터 기반)", async ({
    page,
  }) => {
    const friend = uniqueName("리스트친구");
    const memo = uniqueName("리스트메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    await page.goto("/entries");

    // 타이틀.
    await expect(
      page.getByRole("heading", { name: "받은 신세", level: 1 }),
    ).toBeVisible();

    // 필터 바 — form 역할 + 검색 input.
    await expect(
      page.getByRole("form", { name: "신세 검색 및 필터" }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "메모 검색" })).toBeVisible();

    // 본인 entry 가 결과 리스트에 등장한다.
    // (메모 텍스트가 실제로 보인다는 것은 mock 16건 대신 실 entries 가 결합됐다는 뜻이다 —
    //  mock 16건은 모두 다른 메모라 우리가 만든 unique 메모가 mock 위에서는 나올 수 없다.)
    const list = page.locator("#entries-list");
    await expect(list).toBeVisible();
    await expect(list.getByText(memo, { exact: false })).toBeVisible();

    // 친구 select 안에 우리가 만든 친구 이름이 옵션으로 들어와 있어야 한다
    // (worker 가 mock 친구 옵션을 listFriends 결과로 교체했음을 검증).
    // native <select id="entries-friend"> 의 <option> 텍스트를 직접 확인.
    const friendOptionTexts = await page
      .locator("#entries-friend option")
      .allTextContents();
    expect(friendOptionTexts.some((t) => t.includes(friend))).toBe(true);
  });

  test("[시나리오 2] ?q=메모키워드 → 메모에 키워드가 들어간 entry 만 보인다", async ({
    page,
  }) => {
    const friend = uniqueName("검색친구");
    const keepMemo = uniqueName("KEEP검색매칭");
    const dropMemo = uniqueName("DROP비매칭");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, keepMemo);
    await createEntryForFriend(page, friend, dropMemo);

    // URL 파라미터로 검색 — 서버 필터.
    await page.goto(`/entries?q=KEEP`);

    const memos = await visibleMemos(page);
    // 매칭 entry 만 보이고 비매칭은 빠진다 (대소문자 무시).
    expect(memos.some((m) => m.toLowerCase().includes("keep"))).toBe(true);
    expect(memos.some((m) => m.toLowerCase().includes("drop"))).toBe(false);
  });

  test("[시나리오 3] ?friend=<id> → 해당 친구 entries 만 보인다", async ({
    page,
  }) => {
    const friendKeep = uniqueName("KEEP친구");
    const friendDrop = uniqueName("DROP친구");
    const memoKeep = uniqueName("KEEP친구메모");
    const memoDrop = uniqueName("DROP친구메모");
    await createFriend(page, friendKeep);
    await createFriend(page, friendDrop);
    await createEntryForFriend(page, friendKeep, memoKeep);
    await createEntryForFriend(page, friendDrop, memoDrop);

    // KEEP 친구의 friend_id 를 알아내려면 /entries 페이지의 data-friend-id 를 본다 (memoKeep 행).
    await page.goto("/entries");
    const keepFriendId = await page.evaluate((m) => {
      const li = Array.from(
        document.querySelectorAll<HTMLLIElement>(
          "#entries-list li[data-entry-id]",
        ),
      ).find((el) => (el.dataset.memo ?? "").includes(m.toLowerCase()));
      return li?.dataset.friendId ?? "";
    }, memoKeep);
    expect(keepFriendId).not.toBe("");

    await page.goto(`/entries?friend=${keepFriendId}`);
    const memos = await visibleMemos(page);
    expect(memos.some((m) => m.includes(memoKeep.toLowerCase()))).toBe(true);
    expect(memos.some((m) => m.includes(memoDrop.toLowerCase()))).toBe(false);
  });

  test("[시나리오 4] ?category=<id> → 해당 카테고리 entries 만 보인다", async ({
    page,
  }) => {
    const friend = uniqueName("카테고리친구");
    const memoMaterial = uniqueName("KEEP물질메모");
    const memoMind = uniqueName("DROP마음메모");
    await createFriend(page, friend);
    // 카테고리는 시드 기본 3종. EntryFormDialog 에서 "물질"·"마음" 골라 두 건 만든다.
    await createEntryForFriend(page, friend, memoMaterial, {
      categoryName: "물질",
    });
    await createEntryForFriend(page, friend, memoMind, { categoryName: "마음" });

    // "물질" 카테고리 id 를 memoMaterial 의 data-category-id 로 추출.
    await page.goto("/entries");
    const materialCatId = await page.evaluate((m) => {
      const li = Array.from(
        document.querySelectorAll<HTMLLIElement>(
          "#entries-list li[data-entry-id]",
        ),
      ).find((el) => (el.dataset.memo ?? "").includes(m.toLowerCase()));
      return li?.dataset.categoryId ?? "";
    }, memoMaterial);
    expect(materialCatId).not.toBe("");

    await page.goto(`/entries?category=${materialCatId}`);
    const memos = await visibleMemos(page);
    expect(memos.some((m) => m.includes(memoMaterial.toLowerCase()))).toBe(
      true,
    );
    expect(memos.some((m) => m.includes(memoMind.toLowerCase()))).toBe(false);
  });

  test("[시나리오 5] ?from=&to= → received_date 범위 내 entries 만 보인다 (양 경계 inclusive)", async ({
    page,
  }) => {
    const friend = uniqueName("날짜친구");
    const inRange = uniqueName("IN범위메모");
    const before = uniqueName("BEFORE이전메모");
    const after = uniqueName("AFTER이후메모");

    await createFriend(page, friend);
    // 받은 날짜를 명시적으로 다르게 셋팅.
    await createEntryForFriend(page, friend, before, {
      receivedDate: "2026-04-15",
    });
    await createEntryForFriend(page, friend, inRange, {
      receivedDate: "2026-05-10",
    });
    await createEntryForFriend(page, friend, after, {
      receivedDate: "2026-06-15",
    });

    await page.goto(`/entries?from=2026-05-01&to=2026-05-31`);
    const memos = await visibleMemos(page);
    expect(memos.some((m) => m.includes(inRange.toLowerCase()))).toBe(true);
    expect(memos.some((m) => m.includes(before.toLowerCase()))).toBe(false);
    expect(memos.some((m) => m.includes(after.toLowerCase()))).toBe(false);
  });

  test("[시나리오 6] ?sort=oldest → received_date ASC 정렬로 표시된다", async ({
    page,
  }) => {
    const friend = uniqueName("정렬친구");
    const oldest = uniqueName("OLDEST메모");
    const middle = uniqueName("MIDDLE메모");
    const newest = uniqueName("NEWEST메모");

    await createFriend(page, friend);
    await createEntryForFriend(page, friend, oldest, {
      receivedDate: "2026-01-10",
    });
    await createEntryForFriend(page, friend, middle, {
      receivedDate: "2026-03-15",
    });
    await createEntryForFriend(page, friend, newest, {
      receivedDate: "2026-05-10",
    });

    await page.goto(`/entries?sort=oldest`);
    const memos = await visibleMemos(page);
    // 우리가 만든 3건만 추려 순서 검증 (다른 시드/잔존 memo 가 섞일 가능성 회피).
    const ours = memos.filter((m) =>
      [oldest, middle, newest].some((k) => m.includes(k.toLowerCase())),
    );
    expect(ours.length).toBe(3);
    const idxOldest = ours.findIndex((m) => m.includes(oldest.toLowerCase()));
    const idxMiddle = ours.findIndex((m) => m.includes(middle.toLowerCase()));
    const idxNewest = ours.findIndex((m) => m.includes(newest.toLowerCase()));
    expect(idxOldest).toBeLessThan(idxMiddle);
    expect(idxMiddle).toBeLessThan(idxNewest);
  });

  test("[시나리오 7] 필터 조합 (?q=&friend=&category=&sort=oldest) → 모두 동시에 적용된다", async ({
    page,
  }) => {
    const friendA = uniqueName("조합A친구");
    const friendB = uniqueName("조합B친구");
    await createFriend(page, friendA);
    await createFriend(page, friendB);

    // friendA + 물질 카테고리 + "조합매칭" 토큰을 메모에 포함 — KEEP 대상.
    const memoKeep1 = uniqueName("조합매칭-A1");
    const memoKeep2 = uniqueName("조합매칭-A2");
    // 같은 친구·카테고리지만 메모 토큰 안 맞음 — DROP.
    const memoDropMemoToken = uniqueName("토큰없는-A3");
    // 토큰은 맞지만 친구 다름 — DROP.
    const memoDropFriend = uniqueName("조합매칭-B1");
    // 토큰·친구 맞지만 카테고리 다름 — DROP.
    const memoDropCategory = uniqueName("조합매칭-A4-마음");

    await createEntryForFriend(page, friendA, memoKeep1, {
      categoryName: "물질",
      receivedDate: "2026-02-01",
    });
    await createEntryForFriend(page, friendA, memoKeep2, {
      categoryName: "물질",
      receivedDate: "2026-04-01",
    });
    await createEntryForFriend(page, friendA, memoDropMemoToken, {
      categoryName: "물질",
    });
    await createEntryForFriend(page, friendB, memoDropFriend, {
      categoryName: "물질",
    });
    await createEntryForFriend(page, friendA, memoDropCategory, {
      categoryName: "마음",
    });

    // friendA id, 물질 카테고리 id 를 추출.
    await page.goto("/entries");
    const { fid, cid } = await page.evaluate((mk1) => {
      const li = Array.from(
        document.querySelectorAll<HTMLLIElement>(
          "#entries-list li[data-entry-id]",
        ),
      ).find((el) => (el.dataset.memo ?? "").includes(mk1.toLowerCase()));
      return {
        fid: li?.dataset.friendId ?? "",
        cid: li?.dataset.categoryId ?? "",
      };
    }, memoKeep1);
    expect(fid).not.toBe("");
    expect(cid).not.toBe("");

    await page.goto(
      `/entries?q=${encodeURIComponent("조합매칭")}&friend=${fid}&category=${cid}&sort=oldest`,
    );
    const memos = await visibleMemos(page);
    // 두 건 KEEP 만 살아남는다.
    expect(memos.some((m) => m.includes(memoKeep1.toLowerCase()))).toBe(true);
    expect(memos.some((m) => m.includes(memoKeep2.toLowerCase()))).toBe(true);
    expect(memos.some((m) => m.includes(memoDropMemoToken.toLowerCase()))).toBe(
      false,
    );
    expect(memos.some((m) => m.includes(memoDropFriend.toLowerCase()))).toBe(
      false,
    );
    expect(memos.some((m) => m.includes(memoDropCategory.toLowerCase()))).toBe(
      false,
    );
    // sort=oldest 라 keep1(2-1) → keep2(4-1) 순.
    const idx1 = memos.findIndex((m) => m.includes(memoKeep1.toLowerCase()));
    const idx2 = memos.findIndex((m) => m.includes(memoKeep2.toLowerCase()));
    expect(idx1).toBeLessThan(idx2);
  });

  test("[시나리오 8] 필터 결과가 0건일 때 '조건에 맞는 신세가 없어요' + '필터 초기화' 링크가 보인다", async ({
    page,
  }) => {
    // 데이터는 있게 — 빈 상태(데이터 자체 없음) 분기와 구별.
    const friend = uniqueName("필터빈상태친구");
    const memo = uniqueName("필터빈상태메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    // 매칭 안 될 토큰으로 검색.
    await page.goto(
      `/entries?q=${encodeURIComponent("절대없을검색어ZZZQQ-" + Math.random().toString(36).slice(2, 8))}`,
    );

    const emptyCopy = page.getByText("조건에 맞는 신세가 없어요", {
      exact: false,
    });
    await expect(emptyCopy).toBeVisible();
    // 빈 상태 카드 안의 "필터 초기화" 링크 — /entries 로 가는 anchor.
    // 필터 바에도 동일 라벨이 있어 strict mode 위반 회피용으로 EmptyEntries 카드 한정.
    // EmptyEntries 카드 안에는 aria-label 없는 outline button anchor 가 1개라
    // 카드 컨테이너에서만 link 검색.
    const emptyCard = emptyCopy.locator("xpath=ancestor::*[@data-slot='card'][1]");
    const resetLink = emptyCard.getByRole("link", { name: "필터 초기화" });
    await expect(resetLink).toBeVisible();
    await expect(resetLink).toHaveAttribute("href", "/entries");
  });

  test("[시나리오 9] 데이터 자체 0건일 때 '받은 신세가 없어요' 빈 상태 카피가 보인다", async ({
    page,
  }) => {
    // store reset 직후 — entries 0건.
    await page.goto("/entries");
    await expect(
      page.getByText("받은 신세가 없어요", { exact: false }),
    ).toBeVisible();
    // FAB 안내 카피 (디자이너 골격 그대로).
    await expect(
      page.getByText("우측 하단의 빠른 입력으로 첫 신세를 기록", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("[시나리오 11] 필터 결과 빈 상태에서 '필터 초기화' 링크 클릭 → /entries 로 reset (모든 entries 다시 보임)", async ({
    page,
  }) => {
    const friend = uniqueName("초기화친구");
    const memo = uniqueName("초기화메모");
    await createFriend(page, friend);
    await createEntryForFriend(page, friend, memo);

    // 빈 결과를 만드는 검색어.
    await page.goto(
      `/entries?q=${encodeURIComponent("zzz없을토큰-" + Math.random().toString(36).slice(2, 8))}`,
    );
    const emptyCopy = page.getByText("조건에 맞는 신세가 없어요", {
      exact: false,
    });
    await expect(emptyCopy).toBeVisible();

    // 초기화 anchor 클릭 → /entries 로 navigate.
    // EmptyEntries 카드 안의 link 한정 (필터 바의 동명 ghost link 와 strict mode 충돌 회피).
    const emptyCard = emptyCopy.locator("xpath=ancestor::*[@data-slot='card'][1]");
    await emptyCard.getByRole("link", { name: "필터 초기화" }).click();
    await page.waitForURL("**/entries");
    expect(new URL(page.url()).pathname).toBe("/entries");
    expect(new URL(page.url()).search).toBe("");

    // entry 가 다시 보인다.
    await expect(
      page.locator("#entries-list").getByText(memo, { exact: false }),
    ).toBeVisible();
  });
});
