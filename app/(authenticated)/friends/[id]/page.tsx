import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cake, Pencil, Trash2 } from "lucide-react";

import { FriendDeleteDialog } from "@/components/friends/friend-delete-dialog";
import { FriendFormDialog } from "@/components/friends/friend-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { birthdayCountdownLabel } from "@/lib/friends/birthday";
import { getFriendById } from "@/lib/friends/queries";
import { formatBirthday } from "@/lib/friends/types";

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
 * entries 슬라이스 전까지 placeholder:
 *   - 통계 카드: entries 슬라이스에서 집계
 *   - 받은 신세 타임라인: entries 슬라이스에서 결합
 *   - entry_count: 0 고정 (UI 컴포넌트 호환).
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
  // entries 슬라이스 결합 전까지 0 placeholder. friend-form-dialog / delete-dialog 가 entry_count 를 받는다.
  const entryCount = 0;
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
          <div className="flex shrink-0 gap-1">
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
      </Card>

      {/* 통계 카드 (placeholder — entries 슬라이스 결합) */}
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

      {/* 받은 신세 타임라인 (placeholder) */}
      <section className="mt-6">
        <h2 className="font-heading text-lg font-medium text-foreground">
          받은 신세 타임라인
        </h2>
        <Card size="sm" className="mt-3 items-center gap-2 bg-accent/30 py-8 text-center">
          <p className="text-sm text-foreground">받은 신세가 아직 없어요</p>
          <p className="text-xs text-muted-foreground">
            빠른 입력으로 첫 신세를 기록해 보세요.
          </p>
        </Card>
      </section>
    </main>
  );
}
