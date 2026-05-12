"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import {
  MOCK_CATEGORIES_FOR_SELECT,
  MOCK_FRIENDS_FOR_COMBOBOX,
} from "@/lib/entries/types";
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
 * 친구·카테고리 옵션은 V1 골격에서 mock 으로 시연. worker 가 본 슬라이스에서
 * 서버 컴포넌트 단에서 listFriends() / listCategories() 결과를 prop 으로 넘기는
 * 형태로 결합한다 (FAB 가 client 컴포넌트라 props 로 받아야 함).
 */

export type QuickAddFabProps = {
  /** worker 가 listFriends() 결과로 결합. 미지정 시 mock fallback. */
  friendOptions?: ReadonlyArray<{ id: string; name: string }>;
  /** worker 가 listCategories() 결과로 결합. 미지정 시 mock fallback. */
  categoryOptions?: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  /** Server Action 결합. worker 가 createEntry 를 inject. */
  onSubmitAction?: (formData: FormData) => Promise<void>;
};

export function QuickAddFab({
  friendOptions = MOCK_FRIENDS_FOR_COMBOBOX,
  categoryOptions = MOCK_CATEGORIES_FOR_SELECT,
  onSubmitAction,
}: QuickAddFabProps = {}) {
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
