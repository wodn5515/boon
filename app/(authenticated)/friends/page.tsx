import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { FriendCard } from "@/components/friends/friend-card";
import { FriendFormDialog } from "@/components/friends/friend-form-dialog";
import { FriendsListSearch } from "@/components/friends/friends-list-search";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listFriends } from "@/lib/friends/queries";

export const metadata: Metadata = {
  title: "친구 목록 · Boon",
  description: "받은 마음을 함께 한 친구들의 이름을 한곳에 모아 둡니다.",
};

/**
 * `/friends` — 친구 목록 (PRD §3, §5).
 *
 * Server Component. middleware 가 이미 인증 게이트를 통과시켰다고 가정한다 (003 §C).
 *
 * 결정 로그 004 §A·§D:
 *   - 데이터는 `listFriends()` drizzle 쿼리. RLS 가 본인 user_id 만 통과시킨다.
 *   - 검색은 URL searchParams 기반 (`/friends?q=...`). RSC 친화 + 공유 가능 URL.
 *   - 정렬은 V1 골격에서 이름 오름차순 고정. 디자이너 placeholder 였던 정렬 Select 는
 *     혼동을 줄이기 위해 일단 제거 (entry_count 가 entries 슬라이스 전까지 0 으로 고정이라
 *     "받은 신세 수" 정렬이 의미 없는 상태). 04+ entries 슬라이스에서 다시 검토.
 */

type FriendsPageProps = {
  // Next.js 15: searchParams 는 Promise.
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function FriendsPage({ searchParams }: FriendsPageProps) {
  const params = await searchParams;
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = typeof rawQ === "string" ? rawQ.trim() : undefined;

  const rows = await listFriends({ q: q && q.length > 0 ? q : undefined });
  // entries 슬라이스 전까지 entry_count 는 0 placeholder (Friend UI 도메인 타입).
  const friends = rows.map((row) => ({
    id: row.id,
    name: row.name,
    birthday_month: row.birthday_month,
    birthday_day: row.birthday_day,
    note: row.note,
    entry_count: 0,
  }));

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

      {/* 검색 — 즉시 클라이언트 필터 + Enter 시 ?q=... 로 URL 동기화 (004 §D). */}
      <FriendsListSearch initialQuery={q ?? ""} targetListId="friends-grid" />

      {/* 카드 그리드 또는 빈 상태 */}
      {friends.length === 0 ? (
        <EmptyFriends searched={Boolean(q)} />
      ) : (
        <ul
          id="friends-grid"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {friends.map((friend) => (
            <li key={friend.id} data-friend-name={friend.name}>
              <FriendCard friend={friend} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * 빈 상태 카드 — 베이지 톤 + 부드러운 안내문 (CLAUDE.md §2 강박 톤 회피).
 */
function EmptyFriends({ searched }: { searched: boolean }) {
  if (searched) {
    return (
      <Card className="mt-8 items-center gap-2 bg-accent/40 py-10 text-center">
        <p className="font-heading text-lg font-medium text-foreground">
          검색 결과가 없어요
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          다른 이름으로 검색하거나, 친구를 새로 추가해 보세요.
        </p>
      </Card>
    );
  }
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
