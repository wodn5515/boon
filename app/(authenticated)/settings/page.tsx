import type { Metadata } from "next";
import { LogOut, Plus } from "lucide-react";

import { signOut } from "@/app/(authenticated)/settings/actions";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryItem } from "@/components/categories/category-item";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/user";
import { listCategories } from "@/lib/categories/queries";
import { countEntriesByCategory } from "@/lib/entries/category-counts";
import type { Category as UiCategory } from "@/lib/categories/types";

export const metadata: Metadata = {
  title: "설정 · Boon",
  description: "카테고리 관리와 계정 정보를 한곳에서 살펴봐요.",
};

/**
 * `/settings` — 설정 페이지 (PRD §5).
 *
 * Server Component. middleware + (authenticated)/layout 의 getCurrentUser 가
 * 인증을 두 번 게이트한다 (003 §C, 004 §K defense-in-depth).
 *
 * 섹션:
 *   1) 카테고리 관리 — 시스템 카테고리 먼저, 그 후 사용자 카테고리. "카테고리 추가" 버튼.
 *   2) 계정 — 이메일 + 로그아웃 (Server Action `signOut`).
 *   3) V2 안내 — 다크 모드·휴지통 추후 도입 안내.
 *
 * 결정 로그 005 §G·§D:
 *   - mock 제거, `listCategories()` drizzle 쿼리로 결합 (정렬은 SQL `is_system DESC, sort_order ASC`).
 *   - entry_count 는 entries 슬라이스에서 결합. V1 골격에선 0 placeholder.
 */
export default async function SettingsPage() {
  const [user, dbCategories, entryCounts] = await Promise.all([
    getCurrentUser(),
    listCategories(),
    countEntriesByCategory(),
  ]);
  // layout 에서 redirect 처리하지만 ts narrowing 을 위해 추가 가드.
  const email = user?.email ?? null;

  // DB row → UI 도메인 타입 매핑. entry_count 는 entries 슬라이스에서 결합 (006 §F).
  const categories: UiCategory[] = dbCategories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    is_system: c.is_system,
    sort_order: c.sort_order,
    entry_count: entryCounts.get(c.id) ?? 0,
  }));

  // 006 §J-2 / PR #4 🟡 #2: isFirst/isLast 를 "시스템 그룹" / "사용자 그룹" 경계 기준으로 계산.
  // categories 는 SQL ORDER BY (is_system DESC, sort_order ASC) 로 시스템이 먼저 오는 구조.
  // 사용자 그룹의 첫 카테고리의 "위로 이동" 이 disabled, 사용자 그룹 마지막의 "아래로 이동" 이 disabled.
  const userStartIdx = categories.findIndex((c) => !c.is_system);
  const lastSystemIdx =
    userStartIdx === -1 ? categories.length - 1 : userStartIdx - 1;
  const lastIdx = categories.length - 1;
  // 사용자 카테고리만 있을 수도 있는데 (시드 누락 등) 그 경우는 userStartIdx=0 으로 자연 처리됨.

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {/* 페이지 헤더 */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          설정
        </h1>
        <p className="text-sm text-muted-foreground">
          카테고리와 계정 정보를 관리해요.
        </p>
      </div>

      {/* 1) 카테고리 관리 */}
      <Card className="mt-6 sm:mt-8">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">카테고리 관리</CardTitle>
              <CardDescription>
                기본 카테고리는 이름만 바꿀 수 있고, 직접 추가한 카테고리는
                자유롭게 수정·삭제할 수 있어요.
              </CardDescription>
            </div>
            <CategoryFormDialog
              mode="create"
              trigger={
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus aria-hidden />
                  카테고리 추가
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              아직 카테고리가 없어요. 위 버튼으로 추가해 보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categories.map((c, i) => {
                // 그룹 경계: 시스템 그룹은 0..lastSystemIdx, 사용자 그룹은 userStartIdx..lastIdx.
                const isFirst = c.is_system
                  ? i === 0
                  : i === userStartIdx;
                const isLast = c.is_system
                  ? i === lastSystemIdx
                  : i === lastIdx;
                // 사용자 카테고리 삭제 시 이전 대상 = 같은 사용자 그룹의 다른 카테고리.
                // 시스템 카테고리로 이전하면 의미는 통하지만 사용자 자유 카테고리만 이전 풀로 둔다
                // (디자이너 결정 005 §F + 006 §F: 같은 그룹 내 이전).
                const migrateTargets = categories.filter(
                  (other) =>
                    other.id !== c.id &&
                    other.is_system === c.is_system,
                );
                return (
                  <CategoryItem
                    key={c.id}
                    category={c}
                    isFirst={isFirst}
                    isLast={isLast}
                    entryCount={c.entry_count}
                    migrateTargets={migrateTargets}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 2) 계정 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">계정</CardTitle>
          <CardDescription>
            로그인된 계정을 확인하고, 필요할 때 로그아웃할 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">이메일</span>
            <span className="truncate text-sm font-medium text-foreground">
              {email ?? "—"}
            </span>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 sm:w-auto"
            >
              <LogOut aria-hidden />
              로그아웃
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 3) V2 안내 (옵션) — CLAUDE.md §2 non-goal: 다크 모드 / 휴지통 */}
      <Card className="mt-6 bg-accent/30">
        <CardHeader>
          <CardTitle className="text-base">곧 만나요</CardTitle>
          <CardDescription>
            다크 모드와 휴지통은 V2 에서 더해질 예정이에요.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
