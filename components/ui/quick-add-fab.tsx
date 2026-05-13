"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { cn } from "@/lib/utils";

/**
 * 빠른 입력 FAB — 메인 대시보드 위젯 E (PRD §3).
 *
 * 클릭 시 EntryFormDialog (mode="create") 를 연다. 친구 미리 선택 없음 — 사용자가
 * combobox 에서 직접 선택하거나 인라인 빠른 생성한다.
 *
 * 디자이너 자율 판단 (Lead 위임):
 *   - 위치: 모바일 `bottom-20 right-4` (하단 탭 위로 살짝 띄움) / sm 이상 `bottom-8 right-8`.
 *   - 색: `bg-primary text-primary-foreground` (초록 메인) — 회상 노트 톤에서
 *     강조가 너무 튀지 않도록 그림자도 작게 (`shadow-md`).
 *
 * 결정 로그 006 §I-1: 친구·카테고리 옵션과 `createEntry` Server Action 은
 * server component (authenticated layout) 에서 결합돼 props 로 들어온다 — mock fallback 제거.
 * FAB 가 client 컴포넌트라 props 로 받아야 하지만, 데이터 조회는 모두 서버 측에서.
 */

export type QuickAddFabProps = {
  /** authenticated layout 이 listFriends() 결과로 결합. */
  friendOptions: ReadonlyArray<{ id: string; name: string }>;
  /** authenticated layout 이 listCategories() 결과로 결합. */
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  /** createEntry Server Action — authenticated layout 에서 주입. */
  onSubmitAction: (formData: FormData) => Promise<void>;
};

export function QuickAddFab({
  friendOptions,
  categoryOptions,
  onSubmitAction,
}: QuickAddFabProps) {
  return (
    <EntryFormDialog
      mode="create"
      friendOptions={friendOptions}
      categoryOptions={categoryOptions}
      onSubmitAction={onSubmitAction}
      trigger={
        <button
          type="button"
          aria-label="신세 빠르게 추가"
          className={cn(
            "fixed right-4 bottom-20 z-50",
            "sm:right-8 sm:bottom-8",
            "inline-flex size-14 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-md ring-1 ring-foreground/10",
            "transition-all outline-none",
            "active:translate-y-px",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <Plus aria-hidden className="size-6" />
        </button>
      }
    />
  );
}
