"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — shadcn 패턴 (PRD §6 디자인 시스템).
 *
 * 엑셀 import 슬라이스(009)에서 처음 추가. 매칭 검토(Step 4)의 row 별 "같은 사람" / "건너뛰기"
 * 토글, 일괄 액션 헤더(전체 선택/해제), 미리보기 요약의 included 토글에 사용된다.
 *
 * `indeterminate` 상태(부분 선택)는 일괄 액션 헤더에서 일부 row 만 체크된 시점에 노출.
 * Radix Checkbox 가 `data-state="indeterminate"` 를 부여하므로 svg 분기를 같은 컴포넌트 안에서 처리.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[6px] border border-input bg-background text-primary-foreground transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {/* Radix data-state 가 indeterminate / checked 두 갈래.
            CSS 가 둘 다 같은 시각(채워진 사각형 + 아이콘) 으로 표현하고
            아이콘만 분기 — Minus(부분) vs Check(전체). */}
        <CheckMark />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

function CheckMark() {
  // Radix Indicator 는 indeterminate 상태에서도 렌더되지만, 가시 분기를 위해
  // 부모의 data-state 를 :where 셀렉터로 읽는 대신 항상 두 아이콘을 렌더하고
  // CSS group-* 셀렉터로 토글한다. 그러나 group 사용 없이도 svg 두 개를 절대 위치로
  // 겹쳐두고 data-state 별 visibility 를 in 셀렉터로 분기하면 깔끔.
  return (
    <span
      data-slot="checkbox-icons"
      className={cn(
        "relative inline-flex size-3.5 items-center justify-center",
        // peer/parent data-state 분기 — Tailwind 4 의 in-data-* 셀렉터 활용.
        // checked 일 때 Check 노출, indeterminate 일 때 Minus 노출.
      )}
    >
      <Check
        aria-hidden
        className="absolute size-3.5 in-data-[state=indeterminate]:hidden"
      />
      <Minus
        aria-hidden
        className="absolute size-3.5 in-data-[state=checked]:hidden"
      />
    </span>
  );
}

export { Checkbox };
