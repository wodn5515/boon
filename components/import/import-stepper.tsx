"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stepper — 엑셀 import 5단계 진행 시각화 (PRD §3, 009 슬라이스).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 가로 정렬 + 번호 원형 배지 — 데스크톱 친화. 모바일에서는 가로 스크롤 가능하게 overflow-x-auto.
 *   - 완료 단계 = 초록 채움 + 체크 아이콘 / 현재 단계 = 초록 outline + 굵게 / 미래 단계 = 회색.
 *   - 단계 라벨은 두 줄까지 허용 (한국어 단어 단위) — line break 없이 공백 wrap.
 *   - 클릭 → 이전 단계로만 이동 (다음 단계는 데이터 검증을 거쳐야 하니 본 컴포넌트가 직접 제어 X).
 *
 * 거절된 대안:
 *   - 세로 stepper — 데스크톱에서 공간 낭비, 50~200 row 검토 본문이 좁아짐.
 *   - 단순 "1/5" 텍스트 — 진행감과 전체 흐름 파악 어려움.
 */

export type ImportStep = {
  id: string;
  label: string;
};

export const IMPORT_STEPS: ReadonlyArray<ImportStep> = [
  { id: "upload", label: "파일 업로드" },
  { id: "mapping", label: "컬럼 매핑" },
  { id: "settings", label: "일괄 설정" },
  { id: "review", label: "친구 매칭 검토" },
  { id: "preview", label: "미리보기·실행" },
];

export type ImportStepperProps = {
  /** 현재 활성 step 의 0-based index. */
  current: number;
  /** 이전 단계로 클릭 이동 시 호출 (옵션). 미지정이면 클릭 비활성. */
  onStepClick?: (index: number) => void;
};

export function ImportStepper({ current, onStepClick }: ImportStepperProps) {
  return (
    <nav aria-label="엑셀 가져오기 단계" className="w-full">
      <ol className="flex w-full items-start gap-1 overflow-x-auto pb-1 sm:gap-2">
        {IMPORT_STEPS.map((step, idx) => {
          const isCompleted = idx < current;
          const isCurrent = idx === current;
          const isClickable = onStepClick && idx < current;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
              {/* 단계 배지 + 라벨 */}
              <button
                type="button"
                onClick={isClickable ? () => onStepClick?.(idx) : undefined}
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  isClickable && "hover:bg-muted",
                  !isClickable && "cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isCompleted &&
                      "bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-2 border-primary bg-background text-primary",
                    !isCompleted && !isCurrent &&
                      "border border-border bg-background text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="size-3.5" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-xs sm:text-sm",
                    isCurrent && "font-semibold text-foreground",
                    isCompleted && "text-foreground",
                    !isCompleted && !isCurrent && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* 단계 사이 연결선 — 마지막 단계 뒤엔 없음. */}
              {idx < IMPORT_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    isCompleted ? "bg-primary/60" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
