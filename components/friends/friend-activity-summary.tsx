import { CalendarCheck, CalendarHeart, Hourglass } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate, type FriendActivitySummary } from "@/lib/friends/stats";

/**
 * 친구 활동 요약 카드 (`/friends/[id]` 통계 보강 — PR #9).
 *
 * Server Component (순수 표시).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **3개 통계를 한 카드 안에 세로 적층 (모바일) / 가로 분할 (sm:)** — 친구 상세 페이지에서
 *     월별 추이 차트와 나란히 놓일 때 시각적 무게가 비슷해지도록.
 *   - **회상 노트 톤 한국어 한 문장 + 작은 숫자/날짜** — 단순 "첫 신세: 2024.11.23" 같은
 *     라벨-값 형태는 너무 사무적. PRD §2 "부드러운 환기" 톤에 맞춰 자연어 카피.
 *     - "처음 받은 신세는 {{date}}이에요" (첫 신세)
 *     - "가장 최근 신세는 {{date}}" (마지막 신세)
 *     - "평균 {{N}}일에 한 번 마음을 받았어요" (평균 간격, "신세" 대신 "마음" — 같은 카드 안에서
 *       단어 반복을 피해 톤이 무거워지지 않게)
 *   - **신세 1건 이하 시 평균 간격 안 보여줌** — averageIntervalDays === null 분기.
 *     "평균 N일" 카피만 사라지고 첫/마지막 카피는 같은 날짜로 두 줄 나란히 노출 → 한 번이라도 받은
 *     기억이라는 "회상" 자체는 보존.
 *   - **아이콘**: 첫 신세 = CalendarHeart (시작의 마음), 마지막 = CalendarCheck (가장 가까운),
 *     평균 = Hourglass (간격의 흐름). 모두 lucide-react.
 *   - 빈 상태: "아직 받은 신세가 없어서 통계가 없어요" — 통계 부재를 부담 없이 환기.
 *
 * 거절된 대안:
 *   - **3 grid 카드 분할 (각각 별도 Card)** — 친구 상세 페이지 상단에 이미 "총 신세 / 카테고리 분포"
 *     2-card 통계가 있어서 카드 수가 더 늘면 시각적 잡음. 한 카드 안 grid 가 더 단정.
 *   - **카피 없이 숫자만** — 회상 노트 톤이 사라짐.
 *   - **"X일 만에 한 번씩 만나왔어요" 같은 인격화 카피** — 실제 만남이 아니라 신세 기록 간격이라
 *     사실 왜곡. 카피를 "마음을 받았어요" 로 한정해 신세 기록 의미를 유지.
 */

type FriendActivitySummaryCardProps = {
  summary: FriendActivitySummary;
};

export function FriendActivitySummaryCard({
  summary,
}: FriendActivitySummaryCardProps) {
  const { firstDate, lastDate, averageIntervalDays } = summary;
  const isEmpty = firstDate === null;

  return (
    <Card size="sm" className="px-3">
      <CardHeader className="px-0">
        <CardTitle className="text-sm text-muted-foreground">
          활동 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {isEmpty ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            아직 받은 신세가 없어서 통계가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
            <SummaryRow
              icon={<CalendarHeart aria-hidden className="size-4 text-brand-primary" />}
              caption="처음 받은 신세는"
              value={firstDate ? formatKoreanDate(firstDate) : ""}
              suffix="이에요"
            />
            <SummaryRow
              icon={<CalendarCheck aria-hidden className="size-4 text-brand-light" />}
              caption="가장 최근 신세는"
              value={lastDate ? formatKoreanDate(lastDate) : ""}
            />
            {averageIntervalDays !== null ? (
              <SummaryRow
                icon={<Hourglass aria-hidden className="size-4 text-brand-lime" />}
                caption="평균"
                value={`${averageIntervalDays}일`}
                suffix="에 한 번 마음을 받았어요"
              />
            ) : (
              // 1건 이하: 평균 간격은 정의되지 않음 — 그리드 균형을 위해 부드러운 환기 카피로 자리 유지.
              <li className="flex items-start gap-2 text-xs text-muted-foreground">
                <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                <span>
                  신세가 한 번 더 쌓이면 평균 간격도 보여드려요.
                </span>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 한 칸의 시각/카피 묶음.
 * - caption 은 작은 회색, value 는 강조 (foreground), suffix 는 다시 회색 — 자연어 흐름 유지.
 */
function SummaryRow({
  icon,
  caption,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  caption: string;
  value: string;
  suffix?: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        {caption}{" "}
        <span className="font-medium text-foreground tabular-nums">{value}</span>
        {suffix ? <> {suffix}</> : null}
      </p>
    </li>
  );
}
