import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

import { updateEntry, deleteEntry } from "@/app/(authenticated)/entries/actions";
import { EntriesFilterBar } from "@/components/entries/entries-filter-bar";
import { EntryItem } from "@/components/entries/entry-item";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCategories } from "@/lib/categories/queries";
import { parseEntriesDate } from "@/lib/entries-list/parse-date";
import {
  listEntriesFiltered,
  type EntriesSort,
} from "@/lib/entries-list/queries";
import { listFriends } from "@/lib/friends/queries";

export const metadata: Metadata = {
  title: "받은 신세 · Boon",
  description: "받은 신세를 한곳에 모아 검색하고 회상합니다.",
};

/**
 * `/entries` — 받은 신세 리스트·검색 페이지 (PRD §3, §5, 결정 로그 008).
 *
 * Server Component. middleware + (authenticated)/layout 이 인증 게이트 통과시킨 후 진입.
 *
 * URL searchParams (008 §B):
 *   - q          메모 텍스트 검색 (case-insensitive substring)
 *   - friend     friend_id
 *   - category   category_id
 *   - from / to  ISO YYYY-MM-DD (받은 날짜 범위, 포함)
 *   - sort       "recent" (기본) / "oldest"
 *
 * 데이터 결합 (008 §G + worker 라운드):
 *   - listEntriesFiltered + listFriends + listCategories 를 Promise.all 로 병렬 호출.
 *   - mock 결합 제거 — `lib/entries-list/mock.ts` 도 함께 삭제.
 *   - E2E_BYPASS_AUTH=1 분기는 각 query 함수가 내부에서 처리 (e2e-store 위 모사).
 *
 * 위젯 A 결합 (008 §H): 메인 대시보드 위젯 A 의 `viewAllHref` 가 이미 `/entries` 라
 * 본 페이지 신설만으로 클릭 → 진입 자동 결합.
 */

type EntriesPageProps = {
  // Next.js 15: searchParams 는 Promise.
  searchParams: Promise<{
    q?: string | string[];
    friend?: string | string[];
    category?: string | string[];
    from?: string | string[];
    to?: string | string[];
    sort?: string | string[];
  }>;
};

const LIST_ID = "entries-list";
const RESULT_COUNT_ID = "entries-result-count";

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

function parseSort(raw: string): EntriesSort {
  return raw === "oldest" ? "oldest" : "recent";
}

// 결정 로그 011 §B-2 — semantic validation 은 lib/entries-list/parse-date.ts 가 단일 진실 원천.
//   형식 검사 + new Date round-trip 으로 2026-13-45 / 2026-02-30 같은 invalid 날짜를 거부.
const parseDate = parseEntriesDate;

export default async function EntriesPage({ searchParams }: EntriesPageProps) {
  const params = await searchParams;

  const q = pickFirst(params.q);
  const friend = pickFirst(params.friend);
  const category = pickFirst(params.category);
  const from = parseDate(pickFirst(params.from));
  const to = parseDate(pickFirst(params.to));
  const sort = parseSort(pickFirst(params.sort));

  // 데이터 결합 — listEntriesFiltered + listFriends + listCategories 병렬.
  const [entries, friendsRows, categoriesRows] = await Promise.all([
    listEntriesFiltered({
      q: q || undefined,
      friendId: friend || undefined,
      categoryId: category || undefined,
      from: from || undefined,
      to: to || undefined,
      sort,
    }),
    listFriends(),
    listCategories(),
  ]);

  // 필터 바·EntryItem 옵션으로 정제 — UI 컴포넌트가 요구하는 필드만 추린다.
  const friendOptions = friendsRows.map((f) => ({ id: f.id, name: f.name }));
  const categoryOptions = categoriesRows.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
  }));

  const hasAnyFilter =
    q !== "" ||
    friend !== "" ||
    category !== "" ||
    from !== "" ||
    to !== "" ||
    sort !== "recent";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            받은 신세
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            받은 마음을 한곳에 모아 차분히 돌아봐요.
          </p>
        </div>
        {/* 엑셀 import 진입점 (PR #7 🟢 nit 청산 / 009 §1). */}
        <Button
          asChild
          variant="outline"
          size="lg"
          className="gap-1.5"
          aria-label="엑셀 가져오기"
        >
          <Link href="/entries/import">
            <Upload aria-hidden />
            엑셀 가져오기
          </Link>
        </Button>
      </div>

      {/* 필터 바 (검색·친구·카테고리·날짜·정렬·초기화) */}
      <EntriesFilterBar
        initialQuery={q}
        initialFriendId={friend}
        initialCategoryId={category}
        initialFrom={from}
        initialTo={to}
        initialSort={sort}
        friendOptions={friendOptions}
        categoryOptions={categoryOptions}
        targetListId={LIST_ID}
        resultCountTargetId={RESULT_COUNT_ID}
      />

      {/* 결과 영역 */}
      {entries.length === 0 ? (
        <EmptyEntries hasFilter={hasAnyFilter} />
      ) : (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p
              id={RESULT_COUNT_ID}
              className="text-xs text-muted-foreground"
              aria-live="polite"
            >
              {entries.length}건 표시 중
            </p>
          </div>
          <ul id={LIST_ID} className="flex flex-col gap-2">
            {entries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                showFriend
                friendOptions={friendOptions}
                categoryOptions={categoryOptions}
                onUpdateAction={updateEntry}
                onDeleteAction={deleteEntry}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/**
 * 빈 상태 — 필터 결과 없음 vs 데이터 자체 없음 두 분기 (008 §A).
 *
 * CLAUDE.md §2 강박 톤 회피 — "받은 신세가 없어요" + FAB 안내.
 */
function EmptyEntries({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <Card className="mt-8 items-center gap-2 bg-accent/40 py-10 text-center">
        <p className="font-heading text-lg font-medium text-foreground">
          조건에 맞는 신세가 없어요
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          검색어나 필터를 바꿔보거나, 필터를 초기화해 보세요.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <a href="/entries">필터 초기화</a>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="mt-8 items-center gap-3 bg-accent/40 py-10 text-center">
      <p className="font-heading text-lg font-medium text-foreground">
        받은 신세가 없어요
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        우측 하단의 빠른 입력으로 첫 신세를 기록해 보세요.
      </p>
    </Card>
  );
}
