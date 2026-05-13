"use client";

import * as React from "react";
import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * 카테고리 분포 차트 (위젯 D · /friends/[id] 통계 카드 공용).
 *
 * Client Component — Recharts 가 ResponsiveContainer + hover/state 를 위해 클라이언트 필요.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **PieChart 채택** (Bar 대비):
 *     - "분포(비율)" 가 의미라 절대값 비교가 아니라 "이번 달은 마음 위주였구나" 같은 인상이 더 중요.
 *     - 슬라이스 수가 보통 3~6개라 가독성 충분.
 *     - 빈 슬라이스 회피용으로 inner radius(donut) 살짝 줘서 회상 노트 톤에 맞게 가벼움.
 *   - 색상: 각 카테고리 row 의 color 필드 사용 — 시스템 3종은 cat-material/time/mind,
 *     사용자 카테고리는 본인이 고른 색이 그대로 슬라이스 색이 된다 (D-019).
 *   - 범례: 차트 우측에 카드 형태로 별도 — Pie 자체 라벨은 작은 차트에서 가독성 떨어져 제거.
 *
 * 빈 상태(`data.length === 0`)는 호출자가 위젯 본문에서 별도 카피로 처리한다.
 * 본 컴포넌트는 data 가 비면 null 을 반환.
 */

export type CategoryDistributionDatum = {
  category_id: string;
  name: string;
  icon: string | null;
  color: string;
  count: number;
};

type CategoryDistributionChartProps = {
  data: ReadonlyArray<CategoryDistributionDatum>;
  /** 차트 크기. 기본 h-32 (위젯 D 용). /friends/[id] 통계는 h-40 정도 권장. */
  className?: string;
  /** 범례 노출 여부. 기본 true. */
  showLegend?: boolean;
};

export function CategoryDistributionChart({
  data,
  className,
  showLegend = true,
}: CategoryDistributionChartProps) {
  // Hook 은 early return 보다 위에서 호출 — react-hooks/rules-of-hooks.
  // ChartConfig: category_id 를 키로 (CSS var --color-<key> 충돌 회피를 위해 safe key 변환)
  const config: ChartConfig = React.useMemo(() => {
    const acc: ChartConfig = {
      count: { label: "건" },
    };
    for (const d of data) {
      acc[safeKey(d.category_id)] = {
        label: d.name,
        color: d.color,
      };
    }
    return acc;
  }, [data]);

  const chartData = React.useMemo(
    () =>
      data.map((d) => ({
        ...d,
        key: safeKey(d.category_id),
      })),
    [data],
  );

  if (data.length === 0) return null;

  return (
    <div className={"flex items-center gap-3 " + (className ?? "")}>
      <ChartContainer
        config={config}
        className="aspect-square h-32 max-h-32 w-32 shrink-0"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                nameKey="name"
                hideLabel
                formatter={(value, _name, item) => {
                  const datum = item?.payload as
                    | CategoryDistributionDatum
                    | undefined;
                  return (
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-sm"
                        style={{ backgroundColor: datum?.color }}
                      />
                      <span className="text-foreground">
                        {datum?.icon ? `${datum.icon} ` : ""}
                        {datum?.name}
                      </span>
                      <span className="ml-auto font-medium tabular-nums text-foreground">
                        {value}건
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Pie
            data={chartData as unknown as Record<string, unknown>[]}
            dataKey="count"
            nameKey="name"
            innerRadius={28}
            outerRadius={56}
            paddingAngle={2}
            strokeWidth={2}
            stroke="var(--card)"
          >
            {chartData.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      {showLegend ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
          {data.map((d) => (
            <li
              key={d.category_id}
              className="flex items-center gap-2"
              data-category-id={d.category_id}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {d.icon ? `${d.icon} ` : ""}
                {d.name}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                {d.count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * UUID 또는 임의 string 을 CSS custom property 키로 안전한 형태로 변환.
 * --color-<key> 변수에 들어가야 하므로 영숫자·하이픈만 허용.
 */
function safeKey(id: string): string {
  return `c-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
}
