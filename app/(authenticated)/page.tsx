import type { Metadata } from "next";

import { WidgetFriendsGrid } from "@/components/dashboard/widget-friends-grid";
import { WidgetRecentEntries } from "@/components/dashboard/widget-recent-entries";
import { WidgetThisMonthSummary } from "@/components/dashboard/widget-this-month-summary";
import { WidgetUpcomingBirthdays } from "@/components/dashboard/widget-upcoming-birthdays";
import { getCurrentUser } from "@/lib/auth/user";
import {
  getRecentEntries,
  getThisMonthSummary,
  getTopFriends,
  getUpcomingBirthdays,
} from "@/lib/dashboard/queries";

export const metadata: Metadata = {
  title: "홈 · Boon",
  description: "받은 마음을 한곳에 모아둔 회상 노트",
};

/**
 * `/` — 메인 대시보드 (PRD §3, §5, 결정 로그 D-013).
 *
 * Server Component. 인증 게이트는 (authenticated)/layout.tsx 가 이미 통과시킨다.
 *
 * 위젯 5종 중 4종(A·B·C·D) 을 본 페이지에서 결합. 위젯 E (빠른 입력 FAB) 는
 * (authenticated)/layout.tsx 에 이미 결합돼 있음 (006 §I-1).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **그리드 레이아웃**:
 *     - 모바일: 1열 (A → B → C → D)
 *     - 태블릿/데스크톱: 2열 / D 는 wide span (col-span-2)
 *
 *       [A] [B]
 *       [C] [D ─── wide ───]
 *
 *     - 위 레이아웃은 위젯 D 가 시각적 무게(차트+Top3+숫자) 가 가장 크기 때문에
 *       하단 가로 폭을 차지하도록 의도. 사용자 시선은 위 좌→우, 아래 한 줄로 통합 회상.
 *
 *   - **인사말**: "안녕하세요, {이름 또는 이메일 username}"
 *     - 사용자 도메인에 `name` 컬럼이 없으므로 email 의 `@` 앞부분을 우선 사용.
 *     - 이메일 없으면 "친구" fallback (회상 노트 톤).
 *
 *   - **데이터 결합**: 본격 결합 — lib/dashboard/queries.ts 의 4 함수가 정정-1 패턴 + RLS 통과.
 *     E2E_BYPASS_AUTH 분기는 각 query 내부에서 e2e-store 위로 분기 (시나리오 4 데이터 결합 통과).
 *     디자이너 골격 단계의 lib/dashboard/mock.ts 는 결정 로그 007 §J 채택대로 본 슬라이스에서 제거.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  const greetingName = pickGreetingName(user);

  // 본격 결합 — 4 함수 모두 application-layer user_id 격리 + e2e-store 분기 포함.
  const [recentEntries, topFriends, upcomingBirthdays, thisMonth] =
    await Promise.all([
      getRecentEntries(5),
      getTopFriends(6),
      getUpcomingBirthdays(30),
      getThisMonthSummary(),
    ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 인사말 */}
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          안녕하세요, {greetingName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          오늘은 어떤 마음을 받았나요? 차분히 회상해 보아요.
        </p>
      </header>

      {/* 위젯 그리드 — 모바일 1열, 태블릿/데스크톱 2열 (D 는 wide span) */}
      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-label="대시보드 위젯"
      >
        <WidgetRecentEntries entries={recentEntries} />
        <WidgetFriendsGrid friends={topFriends} />
        <WidgetUpcomingBirthdays items={upcomingBirthdays} />
        <div className="lg:col-span-2">
          <WidgetThisMonthSummary summary={thisMonth} />
        </div>
      </section>
    </main>
  );
}

/**
 * 인사말 이름 선택.
 *
 * 디자이너 위임 결정:
 *   - users 테이블에 별도 `display_name` 컬럼이 V1 엔티티 정의에 없다 (PRD §4).
 *     이메일 username (`@` 앞부분) 을 보여주면 보통 자기 별명과 가깝다.
 *   - 이메일도 없으면 "친구" fallback — Boon 의 회상 노트 톤상 어색하지 않음.
 *   - 이메일 username 이 너무 길거나(>16자) 숫자 잔뜩이면 그냥 그대로 노출 (가공 X) — V1 단순함 우선.
 */
function pickGreetingName(
  user: { email: string | null } | null,
): string {
  const email = user?.email;
  if (!email) return "친구";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}
