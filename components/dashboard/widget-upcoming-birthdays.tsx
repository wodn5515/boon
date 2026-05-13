import Link from "next/link";
import { Cake, Gift } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { cn } from "@/lib/utils";
import type { UpcomingBirthday } from "@/lib/dashboard/types";

/**
 * 위젯 C — 다가오는 생일 + 그 친구한테 받은 신세 모음 (PRD §3, 결정 로그 D-013).
 *
 * Server Component. 페이지가 ReadonlyArray<UpcomingBirthday> 를 props 로 주입.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **"이번 달 생일" 윈도우 = 오늘 ~ 30일 내** (queries.getUpcomingBirthdays days=30).
 *     PRD "이번 달" 의 자연어를 달력 월이 아니라 30일 슬라이딩 윈도우로 해석 —
 *     월말에 다음 달 초 생일이 시야에서 사라지지 않게.
 *   - **D-N 정렬 ASC** — 가까운 친구 먼저.
 *   - 친구한테 받은 신세 메모 0~3건을 "선물 영감" 톤으로 동봉 (회상 노트). 갚음/배지 미노출.
 *   - 생일 라벨: "M월 D일 · D-N". D-N 은 brand-primary 톤 배지.
 *   - 친구 이름 클릭 시 /friends/[id] 로.
 */

type WidgetUpcomingBirthdaysProps = {
  items: ReadonlyArray<UpcomingBirthday>;
};

export function WidgetUpcomingBirthdays({
  items,
}: WidgetUpcomingBirthdaysProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 font-heading text-base font-semibold text-foreground">
          <Cake aria-hidden className="size-4 text-brand-primary" />
          다가오는 생일
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <BirthdayRow key={item.friend_id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BirthdayRow({ item }: { item: UpcomingBirthday }) {
  const countdown =
    item.days_until === 0 ? "오늘" : `D-${item.days_until}`;
  return (
    <li
      data-friend-id={item.friend_id}
      className={cn(
        "rounded-lg border border-border/70 bg-background/50 p-2.5 transition-colors",
        "hover:border-foreground/20",
      )}
    >
      {/* 상단: 친구 + 생일 + D-N */}
      <Link
        href={`/friends/${item.friend_id}`}
        aria-label={`${item.friend_name} 다가오는 생일`}
        className="group/birthday-head flex items-center gap-2 outline-none"
      >
        <InitialAvatar name={item.friend_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground group-hover/birthday-head:underline underline-offset-4">
            {item.friend_name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {item.birthday_month}월 {item.birthday_day}일
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
          aria-label={`생일 ${countdown}`}
        >
          {countdown}
        </span>
      </Link>

      {/* 하단: 그 친구한테서 받은 신세 회상 (선물 영감) */}
      {item.recent_memos.length > 0 ? (
        <div className="mt-2 rounded-md bg-accent/30 px-2.5 py-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-accent-foreground/80">
            <Gift aria-hidden className="size-3" />
            받은 신세 회상
          </p>
          <ul className="flex flex-col gap-1">
            {item.recent_memos.slice(0, 3).map((memo, idx) => (
              <li
                key={idx}
                className="line-clamp-2 text-[11px] leading-snug text-foreground/80"
              >
                · {memo}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-[11px] italic text-muted-foreground/70">
          아직 함께한 기록이 없어요.
        </p>
      )}
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-accent/30 py-8 text-center">
      <p className="text-sm text-foreground">이번 달 생일인 친구가 없어요</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        친구 생일을 등록해 두면 가까운 날에 다시 알려드릴게요.
      </p>
    </div>
  );
}
