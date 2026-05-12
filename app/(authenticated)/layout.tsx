import * as React from "react";

import { Nav } from "@/components/layout/nav";
import { QuickAddFab } from "@/components/ui/quick-add-fab";

/**
 * 인증된 라우트 그룹 레이아웃.
 *
 * Next.js 15 의 route group `(authenticated)` 는 URL 에 영향을 주지 않으면서
 * 인증이 필요한 모든 페이지(`/`, `/friends`, `/entries`, `/settings`)에 공통
 * 외피를 입힌다 (PRD §5 사이트맵).
 *
 * 외피:
 *   - 상단(or 하단) Nav — 인증된 사용자에게만 보이는 메뉴
 *   - 우하단 빠른 입력 FAB — 모든 인증 페이지에 떠 있음 (PRD §3 위젯 E)
 *   - 본문 페이지는 children 으로 받는다.
 *
 * `/login`, `/auth/*` 는 이 그룹 밖이므로 Nav·FAB 가 보이지 않는다.
 * 실제 세션 게이팅은 `middleware.ts` 가 담당한다 (결정 로그 003 §C).
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // pb-24 = 모바일 하단 탭 네비(56px)와 FAB(56px) 겹치지 않게 본문 하단 여유.
    <div className="min-h-screen pb-24 sm:pb-0">
      <Nav />
      {children}
      <QuickAddFab />
    </div>
  );
}
