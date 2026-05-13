import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { cn } from "@/lib/utils";
import type { ThisMonthSummary } from "@/lib/dashboard/types";

import { CategoryDistributionChart } from "./category-distribution-chart";

/**
 * 위젯 D — 이번 달 요약 (PRD §3, 결정 로그 D-013).
 *
 * Server Component. CategoryDistributionChart 만 client 로 분리.
 *
 * 세 영역:
 *   1. **숫자 강조** — 이번 달 count 큰 폰트 + 지난 달 비교 카피 (있으면)
 *   2. **카테고리 분포 차트** — PieChart (Lead 위임: Bar 가 아닌 Pie 채택)
 *   3. **신세 많이 받은 친구 Top 3** — InitialAvatar + 이름 + 건수
 *
 * 디자이너 결정:
 *   - wide span (페이지에서 col-span-2 로 배치) — 데스크톱 2/3 가로 사용
 *   - 빈 상태: count 0 이면 단일 카피 "이번 달 받은 신세가 아직 없어요. 첫 신세를 기록해 보세요"
 *   - 비교 카피: 지난 달 0 이면 "이번 달이 첫 달이에요" 같은 fallback 없이 비교 카피 자체 생략
 */

type WidgetThisMonthSummaryProps = {
  summary: ThisMonthSummary;
};

export function WidgetThisMonthSummary({ summary }: WidgetThisMonthSummaryProps) {
  const isEmpty = summary.count === 0;
  const diffLabel = formatDiff(summary.prev_month_count, summary.count);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-foreground">
          이번 달 받은 마음
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 1) 숫자 강조 */}
            <div className="flex flex-col justify-center gap-1">
              <p className="text-xs text-muted-foreground">이번 달</p>
              <p className="font-heading text-4xl font-semibold text-foreground tabular-nums">
                {summary.count}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  건
                </span>
              </p>
              {diffLabel ? (
                <p className="text-[11px] text-muted-foreground">
                  {diffLabel}
                </p>
              ) : null}
            </div>

            {/* 2) 카테고리 분포 차트 */}
            <div className="lg:col-span-1">
              <p className="mb-2 text-xs text-muted-foreground">카테고리 분포</p>
              {summary.by_category.length > 0 ? (
                <CategoryDistributionChart data={summary.by_category} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  분포를 만들 자료가 아직 적어요.
                </p>
              )}
            </div>

            {/* 3) Top 3 친구 */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                마음을 많이 받은 친구
              </p>
              {summary.top_friends.length > 0 ? (
                <ol className="flex flex-col gap-1.5">
                  {summary.top_friends.slice(0, 3).map((f, idx) => (
                    <li
                      key={f.friend_id}
                      data-friend-id={f.friend_id}
                      className="flex items-center gap-2 rounded-md bg-background/50 px-2 py-1.5"
                    >
                      <span
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                          idx === 0 && "bg-brand-primary text-white",
                          idx === 1 && "bg-brand-light text-white",
                          idx === 2 && "bg-brand-lime text-white",
                        )}
                        aria-label={`${idx + 1}위`}
                      >
                        {idx + 1}
                      </span>
                      <InitialAvatar name={f.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {f.count}건
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground">
                  아직 비교할 만한 친구가 적어요.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 지난 달 ↔ 이번 달 비교 카피.
 *
 * 디자이너 결정:
 *   - prev null → 비교 자체 생략 (기록이 아직 없는 사용자에게 비교 카피는 헛헛함).
 *   - prev 0 && cur > 0 → "지난 달 0건 → 이번 달 N건" (시작의 톤).
 *   - cur >= prev → "지난 달 N건 → 이번 달 M건" 단순 표기 (강박 회피, "더 많이!" 같은 부추김 없음).
 *   - cur < prev → 동일 단순 표기 ("부담 줄어든 회상" 같은 가치 판단 카피는 피한다)
 */
function formatDiff(prev: number | null, cur: number): string | null {
  if (prev == null) return null;
  return `지난 달 ${prev}건 → 이번 달 ${cur}건`;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-accent/30 py-8 text-center">
      <p className="text-sm text-foreground">
        이번 달 받은 신세가 아직 없어요
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        우측 하단의 빠른 입력으로 첫 신세를 기록해 보세요.
      </p>
    </div>
  );
}
