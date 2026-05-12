import Link from "next/link";

import { Card } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { formatBirthday, type Friend } from "@/lib/friends/types";
import { cn } from "@/lib/utils";

/**
 * 친구 카드 — `/friends` 목록의 그리드 셀.
 *
 * 좌측: InitialAvatar(md), 우측: 이름 / 생일 / 받은 신세 N개.
 * 전체 카드가 `/friends/[id]` 로 가는 Link 다 (PRD §5 사이트맵).
 *
 * 호버: 그림자 살짝 올라옴 + 살짝 위로 이동 (회상 노트 톤에 맞춰 과하지 않게).
 * 카드 크기는 모바일·데스크톱 동일하며 그리드만 반응형이다 (목록 페이지 책임).
 */
type FriendCardProps = {
  friend: Friend;
  className?: string;
};

export function FriendCard({ friend, className }: FriendCardProps) {
  const birthday = formatBirthday(friend);

  return (
    <Link
      href={`/friends/${friend.id}`}
      aria-label={`${friend.name} 상세 보기`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card
        size="sm"
        className={cn(
          "h-full transition-all duration-150",
          "group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/20",
          className,
        )}
      >
        <div className="flex items-start gap-3 px-3">
          <InitialAvatar name={friend.name} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-foreground">
              {friend.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {birthday ?? <span className="opacity-0">·</span>}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              받은 신세{" "}
              <span className="font-medium text-foreground">
                {friend.entry_count}
              </span>
              개
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
