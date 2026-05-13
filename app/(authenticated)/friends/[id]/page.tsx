import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cake, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createEntry,
  deleteEntry,
  updateEntry,
} from "@/app/(authenticated)/entries/actions";
import {
  CategoryDistributionChart,
  type CategoryDistributionDatum,
} from "@/components/dashboard/category-distribution-chart";
import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { EntryItem } from "@/components/entries/entry-item";
import { FriendActivitySummaryCard } from "@/components/friends/friend-activity-summary";
import { FriendDeleteDialog } from "@/components/friends/friend-delete-dialog";
import { FriendFormDialog } from "@/components/friends/friend-form-dialog";
import { MonthlyTrendChart } from "@/components/friends/monthly-trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { birthdayCountdownLabel } from "@/lib/friends/birthday";
import { getFriendById, listFriends } from "@/lib/friends/queries";
import { aggregateMonthlyTrend, summarizeActivity } from "@/lib/friends/stats";
import { formatBirthday } from "@/lib/friends/types";
import { listCategories } from "@/lib/categories/queries";
import { listEntriesByFriend } from "@/lib/entries/queries";
import type { Entry } from "@/lib/entries/types";

type FriendDetailPageProps = {
  // Next.js 15: params 는 Promise.
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: FriendDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const friend = await getFriendById(id);
  return {
    title: friend ? `${friend.name} · Boon` : "친구 · Boon",
  };
}

/**
 * `/friends/[id]` — 친구 상세 (PRD §3, §5).
 *
 * 결정 로그 004 §A·§C:
 *   - 데이터는 `getFriendById()` drizzle 쿼리. RLS 가 본인 친구만 통과 — 다른 사용자
 *     친구를 URL 로 찔러 들어와도 null 이라 404.
 *   - soft-deleted 친구는 쿼리에서 자동 제외 (is_deleted=false 필터) — 삭제 직후 redirect 와 정합.
 *
 * entries 슬라이스 (현재 슬라이스):
 *   - 받은 신세 타임라인 = EntryItem 카드 리스트. V1 디자이너 골격에서는 mock 으로 시연.
 *   - 친구 정보 카드 우측 상단에 "신세 추가" 버튼 — defaultFriendId=friend.id 로
 *     EntryFormDialog 가 친구를 미리 선택한 상태로 열린다.
 *   - 통계 카드는 본 슬라이스에서 placeholder 유지 — 다음 dashboard-widgets 슬라이스에서 결합.
 *
 * worker 결합 포인트:
 *   - mock entries 제거 → `listEntriesByFriend(friend.id)` 같은 쿼리 결과로 교체.
 *   - friendOptions / categoryOptions = listFriends() / listCategories() 결과 사용.
 *   - EntryFormDialog 의 onSubmitAction = createEntry / updateEntry Server Action.
 *   - EntryItem 의 onDeleteAction = deleteEntry Server Action.
 */
export default async function FriendDetailPage({ params }: FriendDetailPageProps) {
  const { id } = await params;
  const friend = await getFriendById(id);

  if (!friend) {
    notFound();
  }

  const birthday = formatBirthday(friend);
  const birthdayCountdown = birthdayCountdownLabel(
    friend.birthday_month,
    friend.birthday_day,
  );

  // === entries 슬라이스 결합: friend 의 받은 신세 목록 (006 §B·§I-2) ===
  // listEntriesByFriend 가 application-layer 에서 user_id·friend_id 격리 + 카테고리 JOIN 까지 수행.
  // 친구가 soft-deleted 면 위 getFriendById 가 null 을 반환 — 여기 도달 시점에 친구는 살아 있다.
  const [entryRows, friendList, categoryList] = await Promise.all([
    listEntriesByFriend(friend.id),
    listFriends(),
    listCategories(),
  ]);
  const friendEntries: Entry[] = entryRows.map((r) => ({
    id: r.id,
    friend_id: r.friend_id,
    category_id: r.category_id,
    memo: r.memo,
    received_date: String(r.received_date),
    repayment_timing: r.repayment_timing,
    repayment_specific_date: r.repayment_specific_date
      ? String(r.repayment_specific_date)
      : null,
    is_repaid: r.is_repaid,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    updated_at:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : String(r.updated_at),
    friend_name: friend.name,
    category_name: r.category_name,
    category_icon: r.category_icon,
    category_color: r.category_color,
  }));
  const entryCount = friendEntries.length;

  /**
   * 카테고리 분포 집계 (dashboard 슬라이스 결합).
   *
   * 디자이너 결정 (Lead 위임):
   *   - 위 listEntriesByFriend 결과를 그대로 GROUP BY 해서 client 차트로 넘긴다.
   *     - 별도 SQL aggregate 쿼리(lib/dashboard/queries.getFriendCategoryDistribution) 를
   *       만들 수도 있지만, 친구 한 명의 entries 는 보통 수십~수백 row 라
   *       이미 fetch 한 결과 위에서 in-memory aggregate 가 충분히 저렴하고,
   *       worker 가 별도 SQL 을 결합할 필요가 없어 슬라이스가 더 깔끔하다.
   *   - 정렬: count DESC, name ASC tiebreak (위젯 D 와 동일 규약).
   */
  const friendCategoryDistribution = aggregateByCategory(friendEntries);

  // === PR #9 통계 보강 (디자이너 라운드 골격 — worker 결합 포인트) ===
  // listEntriesByFriend 결과를 그대로 in-memory aggregate.
  // 카테고리 분포와 동일한 패턴: 친구 한 명의 entries 는 보통 수십~수백 row 라
  // 별도 SQL aggregate 가 필요 없고, fetch 한 결과 위에서 충분히 저렴.
  // 자세한 결정 근거는 lib/friends/stats.ts 의 JSDoc 참조.
  // TODO(worker): listEntriesByFriend 가 date asc 가 아닐 수 있다면 정렬 보장 확인.
  //   summarizeActivity 는 내부에서 sort 하지만 aggregateMonthlyTrend 는 received_date 만 본다.
  const friendMonthlyTrend = aggregateMonthlyTrend(friendEntries);
  const friendActivity = summarizeActivity(friendEntries);

  const friendOptions: ReadonlyArray<{ id: string; name: string }> =
    friendList.map((r) => ({ id: r.id, name: r.name }));
  const categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }> = categoryList.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
  }));

  const friendForUi = {
    id: friend.id,
    name: friend.name,
    birthday_month: friend.birthday_month,
    birthday_day: friend.birthday_day,
    note: friend.note,
    entry_count: entryCount,
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 뒤로 가기 */}
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/friends">
            <ArrowLeft aria-hidden />
            친구 목록으로
          </Link>
        </Button>
      </div>

      {/* 친구 정보 카드 */}
      <Card className="gap-6 px-2 py-6 sm:px-4">
        <div className="flex items-start gap-4 px-4">
          <InitialAvatar name={friend.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              {friend.name}
            </h1>
            {birthday ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Cake aria-hidden className="size-4 text-brand-primary" />
                {birthday}
                {birthdayCountdown ? (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    {birthdayCountdown}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                생일 정보가 아직 없어요
              </p>
            )}
            {friend.note ? (
              <p className="mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-line text-foreground/80">
                {friend.note}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                메모를 추가해 두면 회상이 풍부해져요.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
            {/* 친구별 신세 추가 — defaultFriendId 로 친구 미리 선택 */}
            <EntryFormDialog
              mode="create"
              defaultFriendId={friend.id}
              friendOptions={friendOptions}
              categoryOptions={categoryOptions}
              onSubmitAction={createEntry}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  aria-label={`${friend.name}한테 받은 신세 추가`}
                >
                  <Plus aria-hidden />
                  신세 추가
                </Button>
              }
            />
            <div className="flex gap-1">
              <FriendFormDialog
                mode="edit"
                friend={friendForUi}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="친구 정보 수정">
                    <Pencil aria-hidden />
                  </Button>
                }
              />
              <FriendDeleteDialog
                friend={friendForUi}
                entryCount={entryCount}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="친구 삭제"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 통계 카드 — dashboard 슬라이스 결합 (PRD §3 친구 상세 통계) */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card size="sm" className="px-3">
          <CardHeader className="px-0">
            <CardTitle className="text-sm text-muted-foreground">
              총 받은 신세
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <p className="font-heading text-3xl font-semibold text-foreground tabular-nums">
              {entryCount}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                개
              </span>
            </p>
          </CardContent>
        </Card>

        <Card size="sm" className="px-3 sm:col-span-2">
          <CardHeader className="px-0">
            <CardTitle className="text-sm text-muted-foreground">
              카테고리 분포
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {friendCategoryDistribution.length > 0 ? (
              <CategoryDistributionChart data={friendCategoryDistribution} />
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">
                차트는 신세가 한 개 이상 쌓이면 보여드려요.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* === PR #9 통계 보강 — 월별 추이 + 활동 요약 (디자이너 라운드 골격) ===
          worker 결합 포인트:
            - friendMonthlyTrend / friendActivity 는 위에서 in-memory aggregate 완료.
            - 본 슬라이스에 새 SQL 결합은 없음.
            - mock 데이터 시연은 컴포넌트 export (MOCK_MONTHLY_TREND) 로 확인 가능. */}
      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card size="sm" className="px-3">
          <CardHeader className="px-0">
            <CardTitle className="text-sm text-muted-foreground">
              월별 추이
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {friendMonthlyTrend.length > 0 ? (
              <MonthlyTrendChart data={friendMonthlyTrend} />
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">
                추이는 신세가 한 개 이상 쌓이면 보여드려요.
              </p>
            )}
          </CardContent>
        </Card>

        <FriendActivitySummaryCard summary={friendActivity} />
      </section>

      {/* 받은 신세 타임라인 */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-medium text-foreground">
            받은 신세 타임라인
          </h2>
          {friendEntries.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              총 {entryCount}개
            </span>
          ) : null}
        </div>

        {friendEntries.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {friendEntries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                /* 친구 상세 페이지에선 친구 아바타 redundant → 기본 false */
                friendOptions={friendOptions}
                categoryOptions={categoryOptions}
                onUpdateAction={updateEntry}
                onDeleteAction={deleteEntry}
              />
            ))}
          </ul>
        ) : (
          <Card size="sm" className="mt-3 items-center gap-2 bg-accent/30 py-8 text-center">
            <p className="text-sm text-foreground">
              이 친구한테 받은 신세가 아직 없어요
            </p>
            <p className="text-xs text-muted-foreground">
              첫 신세를 기록해 보세요.
            </p>
            <EntryFormDialog
              mode="create"
              defaultFriendId={friend.id}
              friendOptions={friendOptions}
              categoryOptions={categoryOptions}
              onSubmitAction={createEntry}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1"
                  aria-label={`${friend.name}한테 받은 신세 추가`}
                >
                  <Plus aria-hidden />
                  이 친구한테 받은 신세 추가
                </Button>
              }
            />
          </Card>
        )}
      </section>
    </main>
  );
}

/**
 * Entry 배열을 카테고리별로 GROUP BY 집계.
 *
 * - category_id 가 같은 row 들을 합쳐 count 누적.
 * - JOIN 결과의 category_name/icon/color 는 같은 category_id 의 first row 값을 사용.
 *   (drizzle JOIN 이라 한 카테고리는 동일 메타데이터 — 첫 row 면 충분.)
 * - 메타데이터가 없는 row 는 빠르게 skip (방어).
 * - 정렬: count DESC, name ASC tiebreak — 위젯 D 와 동일 규약.
 */
function aggregateByCategory(
  entries: ReadonlyArray<Entry>,
): ReadonlyArray<CategoryDistributionDatum> {
  const bucket = new Map<string, CategoryDistributionDatum>();
  for (const e of entries) {
    if (!e.category_name || !e.category_color) continue;
    const prev = bucket.get(e.category_id);
    if (prev) {
      bucket.set(e.category_id, { ...prev, count: prev.count + 1 });
    } else {
      bucket.set(e.category_id, {
        category_id: e.category_id,
        name: e.category_name,
        icon: e.category_icon ?? null,
        color: e.category_color,
        count: 1,
      });
    }
  }
  return [...bucket.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // ko-KR locale 명시 — queries.ts 의 e2e 분기(`localeCompare(b.name, "ko")`) 및 SQL `asc(friends.name)` 와 정합 (sfx 🟢 N1).
    return a.name.localeCompare(b.name, "ko");
  });
}
