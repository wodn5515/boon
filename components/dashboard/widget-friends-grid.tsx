import Link from "next/link";
import { ArrowRight, Cake } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { birthdayCountdownLabel } from "@/lib/friends/birthday";
import { cn } from "@/lib/utils";
import type { FriendGridCell } from "@/lib/dashboard/types";

/**
 * 위젯 B — 친구별 카드 그리드 (PRD §3, 결정 로그 D-013).
 *
 * Server Component. 페이지가 ReadonlyArray<FriendGridCell> 를 props 로 주입.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **정렬 기준 = 받은 신세 수 DESC** (lib/dashboard/queries.ts::getTopFriends 동일):
 *     - 회상 노트 톤상 "최근 활동" 보다 "누적 인연" 이 의도에 부합.
 *     - count 0 친구도 노출되어야 추가 직후 그리드가 비어 보이지 않음 → name ASC tiebreak.
 *   - 최대 6명 — 데스크톱에서 2열 × 3행, 태블릿 2열 × 3행, 모바일 1열 × 6행.
 *   - 각 셀이 `/friends/[id]` 로 가는 Link (FriendCard 와 같은 패턴).
 *   - 생일 D-N 배지: 생일 정보가 있을 때만, 회상 톤이라 강한 빨강 대신 brand-primary 톤.
 *   - 최근 신세 메모 1줄 truncate. 빈 케이스("recent_memo=null")는 "함께한 기록을 시작해 보세요" 카피.
 */

type WidgetFriendsGridProps = {
  friends: ReadonlyArray<FriendGridCell>;
  viewAllHref?: string;
};

export function WidgetFriendsGrid({
  friends,
  viewAllHref = "/friends",
}: WidgetFriendsGridProps) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base font-semibold text-foreground">
          친구들
        </CardTitle>
        {friends.length > 0 ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="친구 전체 보기"
          >
            전체 보기
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {friends.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {friends.map((friend) => (
              <li key={friend.id}>
                <FriendGridCellLink friend={friend} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FriendGridCellLink({ friend }: { friend: FriendGridCell }) {
  const countdown = birthdayCountdownLabel(
    friend.birthday_month,
    friend.birthday_day,
  );

  return (
    <Link
      href={`/friends/${friend.id}`}
      aria-label={`${friend.name} 상세 보기`}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border border-border/70 bg-background/50 px-2.5 py-2 transition-all",
        "hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card hover:shadow-sm",
        "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
      )}
    >
      <InitialAvatar name={friend.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {friend.name}
          </h3>
          {countdown ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none font-medium text-accent-foreground"
              aria-label={`생일 ${countdown}`}
            >
              <Cake aria-hidden className="size-2.5 text-brand-primary" />
              {countdown}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          받은 신세{" "}
          <span className="font-medium text-foreground">
            {friend.entry_count}
          </span>
          개
        </p>
        {friend.recent_memo ? (
          <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
            {friend.recent_memo}
          </p>
        ) : (
          <p className="mt-1 text-[11px] italic text-muted-foreground/70">
            함께한 기록을 시작해 보세요
          </p>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-accent/30 py-8 text-center">
      <p className="text-sm text-foreground">친구를 추가해 보세요</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        함께 마음을 주고받은 사람의 이름을 모으면 회상이 시작돼요.
      </p>
      <Link
        href="/friends"
        className="mt-1 text-xs text-brand-primary underline-offset-4 hover:underline"
      >
        친구 추가하러 가기
      </Link>
    </div>
  );
}
