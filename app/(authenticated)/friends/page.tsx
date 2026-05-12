import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";

import { FriendCard } from "@/components/friends/friend-card";
import { FriendFormDialog } from "@/components/friends/friend-form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOCK_FRIENDS } from "@/lib/friends/mock";
import type { Friend } from "@/lib/friends/types";

export const metadata: Metadata = {
  title: "친구 목록 · Boon",
  description: "받은 마음을 함께 한 친구들의 이름을 한곳에 모아 둡니다.",
};

/**
 * `/friends` — 친구 목록 (PRD §3, §5).
 *
 * Server Component. middleware 가 이미 인증 게이트를 통과시켰다고 가정한다
 * (결정 로그 003 §C).
 *
 * V1 UI 골격:
 * - 검색 input, 정렬 select 는 디자인만 — 실제 필터·정렬은 worker 가 결합.
 * - 데이터는 `MOCK_FRIENDS` 에서 가져오며, worker 가 drizzle 쿼리로 교체한다.
 * - 카드 그리드는 mobile 1열 / sm(≥640) 2열 / lg(≥1024) 3열.
 * - 친구가 0명이면 베이지 톤 빈 상태 카드 + "친구 추가" CTA.
 */
export default async function FriendsPage() {
  // [placeholder] worker 가 결합:
  //   const friends = await db.query.friends.findMany({ ... with RLS user_id 필터 })
  const friends: Friend[] = MOCK_FRIENDS;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 페이지 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            친구 목록
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            함께 마음을 주고받은 사람들의 이름을 모아둬요.
          </p>
        </div>
        <FriendFormDialog
          mode="create"
          trigger={
            <Button variant="outline" size="lg" className="gap-1.5">
              <Plus aria-hidden />
              친구 추가
            </Button>
          }
        />
      </div>

      {/* 검색 + 정렬 */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          {/* [placeholder] worker 가 검색 결합 — 현재는 디자인만. */}
          <Input
            type="search"
            placeholder="이름으로 검색"
            aria-label="친구 이름 검색"
            className="pl-9"
          />
        </div>
        {/* [placeholder] worker 가 정렬 결합. */}
        <Select defaultValue="name">
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">이름순</SelectItem>
            <SelectItem value="entry_count">받은 신세 수</SelectItem>
            <SelectItem value="recent">최근 활동</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 카드 그리드 또는 빈 상태 */}
      {friends.length === 0 ? (
        <EmptyFriends />
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend) => (
            <li key={friend.id}>
              <FriendCard friend={friend} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * 빈 상태 카드 — 베이지 톤 + 부드러운 안내문.
 * "부채 트래커가 아니라 회상 노트" (CLAUDE.md §2) 톤을 유지하기 위해
 * 강제·의무 카피를 피한다.
 */
function EmptyFriends() {
  return (
    <Card className="mt-8 items-center gap-4 bg-accent/40 py-10 text-center">
      <p className="font-heading text-lg font-medium text-foreground">
        아직 등록된 친구가 없어요
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        첫 친구를 추가하면 받은 마음을 차곡차곡 모을 수 있어요.
      </p>
      <FriendFormDialog
        mode="create"
        trigger={
          <Button variant="outline" size="lg" className="gap-1.5">
            <Plus aria-hidden />첫 친구 추가
          </Button>
        }
      />
    </Card>
  );
}
