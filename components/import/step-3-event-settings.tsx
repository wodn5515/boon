"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REPAYMENT_TIMING_OPTIONS,
  type RepaymentTiming,
} from "@/lib/entries/types";
import type { BatchSettings } from "@/lib/import/types";

/**
 * Step 3 — 일괄 설정 (PRD §3).
 *
 * 모든 row 에 공통 적용되는 메타 — 이벤트명·받은 날짜·카테고리·보답 시점.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 보답 시점 기본값 = "specific_event" (특정 이벤트 대기) — D-016 결혼식/장례식 시나리오의 자연 기본값.
 *     일반 entries 추가 모달은 "anytime" 기본이지만, 엑셀 import 는 다수의 축의금 시나리오가 많아
 *     "갚을 때가 정해진 보답" 톤이 어울린다.
 *   - 카테고리 기본값 = props 의 첫 시스템 카테고리 (보통 "물질") — 친구·축의금 시나리오 자연.
 *   - 이벤트명 placeholder = "결혼식 축의금" — 결정 로그 D-016 시나리오 직접 참조.
 *   - 받은 날짜 기본 = 오늘 (entries 폼과 정합).
 *
 * 거절된 대안:
 *   - row 별 카테고리 다르게 설정 — 결혼식 축의금 한 번에 200건 시나리오에선 과한 자유도.
 *     필요하면 import 후 개별 수정.
 *   - 이벤트명 자동 추론 (파일명에서) — 파일명이 "신랑신부_엑셀_최종_v2.xlsx" 식이면 무의미.
 */

export type Step3EventSettingsProps = {
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  /** 이전 단계에서 누적된 값. 뒤로가기 후 돌아왔을 때 복원. */
  initial?: BatchSettings;
  onBack: () => void;
  onNext: (settings: BatchSettings) => void;
};

function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function Step3EventSettings({
  categoryOptions,
  initial,
  onBack,
  onNext,
}: Step3EventSettingsProps) {
  const defaultCategoryId = initial?.categoryId ?? categoryOptions[0]?.id ?? "";
  const [eventName, setEventName] = React.useState(initial?.eventName ?? "");
  const [receivedDate, setReceivedDate] = React.useState(
    initial?.receivedDate ?? todayISODate(),
  );
  const [categoryId, setCategoryId] = React.useState(defaultCategoryId);
  const [timing, setTiming] = React.useState<RepaymentTiming>(
    initial?.repaymentTiming ?? "specific_event",
  );

  const eventNameTrim = eventName.trim();
  const canProceed =
    eventNameTrim.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(receivedDate) &&
    categoryId.length > 0;

  function handleNext() {
    if (!canProceed) return;
    onNext({
      eventName: eventNameTrim,
      receivedDate,
      categoryId,
      repaymentTiming: timing,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        이 엑셀로 추가될 모든 신세에 공통으로 적용돼요. 나중에 개별 수정도 가능해요.
      </p>

      <div className="grid gap-4">
        {/* 이벤트명 — memo prefix */}
        <div className="grid gap-1.5">
          <Label htmlFor="import-event-name">
            이벤트명 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="import-event-name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="예: 결혼식 축의금"
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            각 신세의 메모 앞에 붙어요. 나중에 검색·필터에서 한 번에 찾을 수 있어요.
          </p>
        </div>

        {/* 받은 날짜 */}
        <div className="grid gap-1.5">
          <Label htmlFor="import-received-date">받은 날짜</Label>
          <Input
            id="import-received-date"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="w-full"
          />
        </div>

        {/* 카테고리 */}
        <div className="grid gap-1.5">
          <Label htmlFor="import-category">카테고리</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger
              id="import-category"
              className="w-full"
              aria-label="카테고리"
            >
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-flex size-5 items-center justify-center rounded-md text-sm"
                      style={{
                        backgroundColor: `${c.color}1f`,
                        color: c.color,
                      }}
                    >
                      {c.icon ?? (
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                      )}
                    </span>
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 보답 시점 */}
        <div className="grid gap-1.5">
          <Label htmlFor="import-repayment-timing">보답 시점</Label>
          <Select
            value={timing}
            onValueChange={(v) => setTiming(v as RepaymentTiming)}
          >
            <SelectTrigger
              id="import-repayment-timing"
              className="w-full"
              aria-label="보답 시점"
            >
              <SelectValue placeholder="보답 시점 선택" />
            </SelectTrigger>
            <SelectContent>
              {REPAYMENT_TIMING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            결혼식·장례식 같은 큰 이벤트는 보통 &lsquo;특정 이벤트 대기&rsquo; 가 자연스러워요.
          </p>
        </div>
      </div>

      {/* 메모 prefix 미리보기 */}
      <PreviewMemo eventName={eventNameTrim} />

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleNext}
          disabled={!canProceed}
        >
          다음 — 친구 매칭 검토
        </Button>
      </div>
    </div>
  );
}

function PreviewMemo({ eventName }: { eventName: string }) {
  if (!eventName) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        이벤트명을 입력하면 메모 미리보기가 여기에 표시돼요.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-border bg-accent/20 px-3 py-2 text-xs text-foreground">
      <p className="text-muted-foreground">메모 미리보기 (예시)</p>
      <p className="mt-0.5 font-medium">
        {eventName} · 김민준 · 금액 100,000원
      </p>
    </div>
  );
}
