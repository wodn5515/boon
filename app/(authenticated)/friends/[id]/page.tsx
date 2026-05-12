import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cake, Pencil, Plus, Trash2 } from "lucide-react";

import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { EntryItem } from "@/components/entries/entry-item";
import { FriendDeleteDialog } from "@/components/friends/friend-delete-dialog";
import { FriendFormDialog } from "@/components/friends/friend-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { birthdayCountdownLabel } from "@/lib/friends/birthday";
import { getFriendById, listFriends } from "@/lib/friends/queries";
import { formatBirthday } from "@/lib/friends/types";
import { listCategories } from "@/lib/categories/queries";
import {
  MOCK_CATEGORIES_FOR_SELECT,
  MOCK_ENTRIES,
  MOCK_FRIENDS_FOR_COMBOBOX,
  type Entry,
} from "@/lib/entries/types";

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

  // === entries 슬라이스 결합: friend 의 받은 신세 목록 ===
  // V1 골격: mock 데이터를 친구 이름으로 재라벨링해 미리보기. worker 가 listEntriesByFriend(id) 로 교체.
  const friendEntries: Entry[] = MOCK_ENTRIES.map((e) => ({
    ...e,
    friend_id: friend.id,
    friend_name: friend.name,
  }));
  const entryCount = friendEntries.length;

  // combobox / select 옵션 — worker 가 실제 쿼리로 교체.
  // V1 골격에서는 listFriends() 가 결합돼 있으면 그대로 쓰고, 실패하거나 비어 있으면 mock 으로 fallback.
  let friendOptions: ReadonlyArray<{ id: string; name: string }>;
  try {
    const rows = await listFriends();
    friendOptions = rows.length > 0
      ? rows.map((r) => ({ id: r.id, name: r.name }))
      : MOCK_FRIENDS_FOR_COMBOBOX;
  } catch {
    friendOptions = MOCK_FRIENDS_FOR_COMBOBOX;
  }
  let categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  try {
    const rows = await listCategories();
    categoryOptions = rows.length > 0
      ? rows.map((r) => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          color: r.color,
        }))
      : MOCK_CATEGORIES_FOR_SELECT;
  } catch {
    categoryOptions = MOCK_CATEGORIES_FOR_SELECT;
  }

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

      {/* 통계 카드 (placeholder — 다음 dashboard-widgets 슬라이스에서 결합) */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card size="sm" className="px-3">
          <CardHeader className="px-0">
            <CardTitle className="text-sm text-muted-foreground">
              총 받은 신세
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <p className="font-heading text-3xl font-semibold text-foreground">
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
            <p className="py-4 text-center text-xs text-muted-foreground">
              차트는 신세가 한 개 이상 쌓이면 보여드려요.
            </p>
          </CardContent>
        </Card>
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
              trigger={
                <Button variant="outline" size="sm" className="mt-2 gap-1">
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
