import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import {
  formatReceivedDate,
  formatRepaymentBadge,
  type Entry,
} from "@/lib/entries/types";

/**
 * 위젯 A — 받은 신세 리스트 (PRD §3 메인 대시보드, 결정 로그 D-013).
 *
 * Server Component. 페이지가 ReadonlyArray<Entry> 를 props 로 주입.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **compact row** — 메인 대시보드에선 EntryItem 의 액션(수정·삭제) 누르는 빈도가 낮고,
 *     5건이 한눈에 들어와야 하므로 EntryItem 을 그대로 쓰지 않고 **compact row** 로 재단했다.
 *     수정·삭제는 `/entries` 또는 `/friends/[id]` 에서 진행 (PRD §5 사이트맵).
 *   - row 구성: 친구 InitialAvatar(sm) + 메모 1줄 truncate + 카테고리 칩 + 받은 날짜.
 *     "친구 + 메모" 가 가장 회상 자극을 주는 조합이라 카테고리는 작게 우측.
 *   - "전체 보기" → /entries 로 이동 (다음 슬라이스에서 페이지 구현).
 *   - 빈 상태 카피: "아직 받은 신세가 없어요" + FAB 가이드. 강박 톤 회피 (CLAUDE.md §2).
 */

type WidgetRecentEntriesProps = {
  entries: ReadonlyArray<Entry>;
  /** "전체 보기" 링크 — 다음 슬라이스에서 /entries 페이지 실제 결합. 기본 "/entries". */
  viewAllHref?: string;
};

export function WidgetRecentEntries({
  entries,
  viewAllHref = "/entries",
}: WidgetRecentEntriesProps) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base font-semibold text-foreground">
          최근 받은 신세
        </CardTitle>
        {entries.length > 0 ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="받은 신세 전체 보기"
          >
            전체 보기
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <RecentEntryRow
                key={entry.id}
                entry={entry}
                isLast={idx === entries.length - 1}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentEntryRow({ entry, isLast }: { entry: Entry; isLast: boolean }) {
  const dateLabel = formatReceivedDate(entry.received_date);
  const timingBadge = formatRepaymentBadge(
    entry.repayment_timing,
    entry.repayment_specific_date,
  );

  return (
    <li
      data-entry-id={entry.id}
      data-repaid={entry.is_repaid ? "true" : "false"}
      className={
        "flex items-start gap-2.5 py-2.5" +
        (isLast ? "" : " border-b border-border/60") +
        (entry.is_repaid ? " opacity-60" : "")
      }
    >
      {/* 좌측: 친구 이니셜 아바타 (sm) */}
      <InitialAvatar name={entry.friend_name ?? "친구"} size="sm" />
      {/* 가운데: 메모 + 메타 */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm leading-snug text-foreground">
          {entry.memo || "(메모 없음)"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="text-foreground/70">{entry.friend_name}</span>
          <span aria-hidden>·</span>
          <span>{dateLabel}</span>
          {entry.category_name ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5"
              style={{
                backgroundColor: entry.category_color
                  ? `${entry.category_color}1f`
                  : undefined,
                color: entry.category_color,
              }}
            >
              {entry.category_icon ? (
                <span aria-hidden>{entry.category_icon}</span>
              ) : null}
              <span>{entry.category_name}</span>
            </span>
          ) : null}
          <span
            className="rounded-md border border-border px-1 py-0.5 text-[10px] leading-none font-medium text-muted-foreground"
            aria-label={`보답 시점: ${timingBadge}`}
          >
            {timingBadge}
          </span>
        </div>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-accent/30 py-8 text-center">
      <p className="text-sm text-foreground">아직 받은 신세가 없어요</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        우측 하단의 빠른 입력으로 첫 신세를 기록해 보세요.
      </p>
    </div>
  );
}
