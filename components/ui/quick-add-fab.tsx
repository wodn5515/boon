"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * 빠른 입력 FAB — 메인 대시보드 위젯 E (PRD §3).
 *
 * V1 친구 슬라이스에서는 "신세 추가" 모달 자체는 entries 슬라이스의 책임이므로
 * 여기서는 placeholder dialog 만 띄운다. 시각 골격(위치·색·아이콘)을 확정하고
 * 다른 슬라이스가 동일 자리에 실제 모달 트리거를 연결할 수 있도록 한다.
 *
 * 디자이너 자율 판단 (Lead 위임):
 *   - 위치: 모바일 `bottom-20 right-4` (하단 탭 위로 살짝 띄움) /
 *           sm 이상 `bottom-8 right-8`.
 *   - 색: `bg-primary text-primary-foreground` (초록 메인) — 회상 노트 톤에서
 *     강조가 너무 튀지 않도록 그림자도 작게 (`shadow-md`).
 */
export function QuickAddFab() {
  return (
    <Dialog>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>신세 추가</DialogTitle>
          <DialogDescription>
            신세 추가 폼은 곧 연결돼요. 잠시만 기다려 주세요.
          </DialogDescription>
        </DialogHeader>
        {/*
         * [placeholder] entries 슬라이스에서 EntryFormDialog 로 교체.
         * 현재는 빈 영역만 두어 시각 골격을 점유한다.
         */}
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
          신세 추가 폼 자리
        </div>
      </DialogContent>
    </Dialog>
  );
}
