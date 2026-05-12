"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";

import { reorderCategory } from "@/app/(authenticated)/settings/actions";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryDeleteDialog } from "@/components/categories/category-delete-dialog";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/categories/types";
import { cn } from "@/lib/utils";

/**
 * 카테고리 카드 — `/settings` 카테고리 목록의 한 줄.
 *
 * 레이아웃 (좌→우):
 *  - 좌측: 아이콘 (이모지 1자) — 없으면 카테고리 색상의 둥근 색상 칩 fallback
 *  - 가운데: 이름 + (is_system) "기본" 배지
 *  - 우측: 정렬 위/아래 버튼 + 수정(연필) + 삭제(휴지통, 시스템이면 hidden)
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 정렬 UX = 위/아래 화살표 버튼 (drag-and-drop 대안 거절: 모바일 접근성 + 의존성 추가 비용)
 *   - "기본" 배지 = text-xs muted + outline 박스 (시스템 카테고리는 보장된다는 시각 신호)
 *   - 시스템 카테고리 삭제 버튼은 hidden (disabled 아닌 hidden — UI 노이즈 축소)
 *
 * 결정 로그 005 §C·§G: 정렬 화살표를 `reorderCategory` Server Action 으로 결합.
 * onMoveUp/onMoveDown prop 이 명시되면 그것을 우선 사용 (테스트 친화). 없으면 기본 액션.
 */
type CategoryItemProps = {
  category: Category;
  isFirst?: boolean;
  isLast?: boolean;
  /** worker 가 결합. 결합 전엔 항상 0 placeholder. */
  entryCount?: number;
  /** 카테고리 삭제 시 entries 이전 대상 후보 (006 §F). 사용자 카테고리에서만 의미. */
  migrateTargets?: Category[];
  /** 외부 주입 가능 (테스트·디자이너 골격용). 미지정 시 reorderCategory Server Action 사용. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  className?: string;
};

export function CategoryItem({
  category,
  isFirst = false,
  isLast = false,
  entryCount = 0,
  migrateTargets,
  onMoveUp,
  onMoveDown,
  className,
}: CategoryItemProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleMove(direction: "up" | "down") {
    const override = direction === "up" ? onMoveUp : onMoveDown;
    if (override) {
      override();
      return;
    }
    startTransition(async () => {
      try {
        await reorderCategory(category.id, direction);
        router.refresh();
      } catch {
        // silent — 상한·시스템 침범은 서버에서 throw 하지 않고 noop 으로 처리되므로 UI 영향 없음.
      }
    });
  }
  return (
    <li
      data-category-id={category.id}
      data-system={category.is_system ? "true" : "false"}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors",
        "hover:border-foreground/20",
        className,
      )}
    >
      {/* 좌측 아이콘 / 색상 칩 */}
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-lg"
        style={{
          backgroundColor: `${category.color}1f`, // 12% alpha 배경
          color: category.color,
        }}
      >
        {category.icon ?? (
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: category.color }}
          />
        )}
      </span>

      {/* 가운데 이름 + 배지 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {category.name}
          </span>
          {category.is_system ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
              기본
            </span>
          ) : null}
        </div>
        {/* 결합 후엔 "신세 N개" 표시. V1 골격에선 placeholder 숨김 처리. */}
        {entryCount > 0 ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            신세 {entryCount}개
          </p>
        ) : null}
      </div>

      {/* 우측 액션들 */}
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${category.name} 위로 이동`}
          disabled={isFirst || pending}
          onClick={() => handleMove("up")}
        >
          <ChevronUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${category.name} 아래로 이동`}
          disabled={isLast || pending}
          onClick={() => handleMove("down")}
        >
          <ChevronDown aria-hidden />
        </Button>
        <CategoryFormDialog
          mode="edit"
          category={category}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${category.name} 수정`}
            >
              <Pencil aria-hidden />
            </Button>
          }
        />
        {category.is_system ? null : (
          <CategoryDeleteDialog
            category={category}
            entryCount={entryCount}
            migrateTargets={migrateTargets}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${category.name} 삭제`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden />
              </Button>
            }
          />
        )}
      </div>
    </li>
  );
}
