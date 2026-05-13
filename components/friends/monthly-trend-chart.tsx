"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyTrendDatum } from "@/lib/friends/stats";

/**
 * 월별 받은 신세 누적 추이 차트 (`/friends/[id]` 통계 보강 — PR #9).
 *
 * Client Component — Recharts ResponsiveContainer + 마우스 hover 가 client 필요.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **AreaChart 채택** (Bar 대비):
 *     - "추이"의 의미가 강조될 차트 — 시간상 흐름과 누적 인상이 회상 노트 톤(PRD §2)과 정합.
 *     - Bar 는 "얼마나 많이?" 절대값 비교 인상이 강한데, 우리는 "어떻게 흘러왔나" 가 의미.
 *     - 빈 달이 0 으로 채워져도 Area 는 평평한 베이스라인으로 자연스럽게 이어짐
 *       — Bar 라면 0 짜리 막대가 시각적으로 갭처럼 보여 어색.
 *     - 단색 그라데이션(--brand-primary → 투명) 으로 식물·자연 메타포 톤 유지.
 *   - 색상: --brand-primary (초록 메인) 단색. 카테고리 분포 차트는 카테고리별 색을 쓰지만
 *     본 차트는 "한 친구의 시간 흐름" 한 시리즈이라 톤을 헷갈리지 않게 브랜드 메인 그린 한 색.
 *   - 격자: 가로 점선만. 세로 격자선은 모바일에서 시각적 잡음.
 *   - Y축 라벨: 안 표시. 회상 노트 톤에 숫자 축이 부담스러움 — Tooltip 에서만 정확한 건수 노출.
 *
 * 거절된 대안:
 *   - **BarChart** — 위 회상 노트 톤 위배. 또한 12개월 안에 데이터가 적으면 막대 사이 갭이 너무 커서 어색.
 *   - **LineChart** — Area 보다 회상 인상이 가벼움. 식물 메타포 (잎이 펼쳐지듯 채워지는 면적) 가 Boon 톤에 더 맞음.
 *   - **누적 영역** — 단일 시리즈라 누적 의미 없음.
 *
 * 빈 상태:
 *   - data.length === 0 이면 null 반환. 호출자가 카드 본문에서 "신세가 한 개 이상 쌓이면..." 카피로 처리.
 *   - 데이터 1건도 stats.aggregateMonthlyTrend 가 최소 6개월 폭으로 패딩 → 한 점이라도 차트는 그려진다.
 */

export type { MonthlyTrendDatum };

type MonthlyTrendChartProps = {
  data: ReadonlyArray<MonthlyTrendDatum>;
  className?: string;
};

const CHART_CONFIG: ChartConfig = {
  count: {
    label: "건",
    color: "var(--brand-primary)",
  },
};

export function MonthlyTrendChart({ data, className }: MonthlyTrendChartProps) {
  // 모바일에서 X 축 라벨이 겹치지 않도록 데이터 양에 따라 tick 간격 조절.
  // 6~12개월: 모두 표시 / 13~24개월: 격월 / 25~ : 분기.
  const tickInterval = React.useMemo(() => {
    if (data.length <= 12) return 0;
    if (data.length <= 24) return 1;
    return 2;
  }, [data.length]);

  if (data.length === 0) return null;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      className={"aspect-auto h-40 w-full " + (className ?? "")}
    >
      <AreaChart
        data={data as unknown as Record<string, unknown>[]}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="boon-monthly-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={tickInterval}
          minTickGap={8}
        />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const datum = payload?.[0]?.payload as
                  | MonthlyTrendDatum
                  | undefined;
                return datum ? formatTooltipMonth(datum.month) : "";
              }}
              formatter={(value) => (
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--brand-primary)" }}
                  />
                  <span className="text-foreground">받은 신세</span>
                  <span className="ml-auto font-medium tabular-nums text-foreground">
                    {value}건
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--brand-primary)"
          strokeWidth={2}
          fill="url(#boon-monthly-trend-fill)"
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * "2025-04" → "2025년 4월" (Tooltip 표제).
 * X 축의 짧은 라벨("4월", "25.4")보다 Tooltip 에서는 풀 라벨로 명확하게.
 */
function formatTooltipMonth(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${m[1]}년 ${Number(m[2])}월`;
}

// 결정 로그 011 §D-1 — MOCK_MONTHLY_TREND export 제거.
//   worker 결합 후 page.tsx 가 aggregateMonthlyTrend(friendEntries) 결과를 직접 넘기므로
//   mock 데이터는 미사용. PR #9 🟢 nit + sfx 🟢 청산.
