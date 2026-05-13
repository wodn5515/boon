"use client";

import * as React from "react";
import { Check, Pencil, Trash2 } from "lucide-react";

import { EntryDeleteDialog } from "@/components/entries/entry-delete-dialog";
import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { Button } from "@/components/ui/button";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import type { FriendComboboxOption } from "@/components/entries/friend-combobox";
import {
  formatReceivedDate,
  formatRepaymentBadge,
  type Entry,
} from "@/lib/entries/types";
import { cn } from "@/lib/utils";

/**
 * 받은 신세 타임라인 카드 — `/friends/[id]` 등에서 사용 (PRD §3).
 *
 * 레이아웃 (좌→우):
 *   - 좌측: 카테고리 아이콘 (또는 색상 칩 fallback) — 항상 노출
 *     · 옵션 prop `showFriend=true` 일 때만 친구 InitialAvatar 도 함께 (메인 피드 등에서 사용)
 *     · 친구 상세 페이지에서는 redundant 라 기본 false
 *   - 가운데: 메모 (2줄 truncate) + 메타데이터 줄(받은 날짜 · 카테고리 이름 · 보답 시점 배지)
 *   - 우측: 수정(Pencil) + 삭제(Trash2)
 *
 * 갚음 상태 (`is_repaid=true`): 좌측에 체크 마크 오버레이 + opacity-60.
 * 회상 노트 톤이라 strikethrough 같은 강조 대신 부드럽게 grayed.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 메모 2줄 truncate (line-clamp-2). 더 길면 친구 상세에서 "더 보기" 같은 액션 대신
 *     카드 자체를 클릭 가능하게 만드는 안도 있지만 V1 골격에서는 단순 truncate.
 *   - 보답 시점 배지 = 카테고리 색상 풀과 겹치지 않게 outline 박스. "특정 날짜" 는
 *     formatRepaymentBadge 로 "5.20에" 같은 구체 날짜를 보여준다.
 *   - 갚음 표시 = 좌측 아이콘 위에 체크 오버레이 + 카드 전체 opacity-60.
 *
 * 008 §C·§E: `/entries` 페이지의 즉시 클라이언트 필터가 `<li>` data-* 속성 매칭으로
 *   결과를 즉시 토글한다. 다음 4개 속성을 항상 노출 — 필터 바가 알지 못해도 무해.
 *     · data-friend-id      — 친구 필터 매칭
 *     · data-category-id    — 카테고리 필터 매칭
 *     · data-received-date  — 날짜 범위 매칭 (YYYY-MM-DD 문자열 비교)
 *     · data-memo           — 메모 텍스트 검색 매칭 (lowercase)
 *   data-entry-id, data-repaid 는 기존부터 노출. 모든 속성은 시각/접근성에 영향 없음.
 */

type EntryItemProps = {
  entry: Entry;
  /** 메인 피드 등 친구를 명시할 필요가 있을 때 친구 아바타도 같이 노출. */
  showFriend?: boolean;
  /** EntryFormDialog 결합용 — 친구·카테고리 옵션. */
  friendOptions: ReadonlyArray<FriendComboboxOption>;
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  /** Server Action inject. worker 가 결합. UI 골격은 noop. */
  onUpdateAction?: (formData: FormData) => Promise<void>;
  onDeleteAction?: (id: string) => Promise<void>;
  className?: string;
};

export function EntryItem({
  entry,
  showFriend = false,
  friendOptions,
  categoryOptions,
  onUpdateAction,
  onDeleteAction,
  className,
}: EntryItemProps) {
  const dateLabel = formatReceivedDate(entry.received_date);
  const timingBadge = formatRepaymentBadge(
    entry.repayment_timing,
    entry.repayment_specific_date,
  );

  return (
    <li
      data-entry-id={entry.id}
      data-repaid={entry.is_repaid ? "true" : "false"}
      data-friend-id={entry.friend_id}
      data-category-id={entry.category_id}
      data-received-date={entry.received_date}
      data-memo={entry.memo.toLowerCase()}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors",
        "hover:border-foreground/20",
        entry.is_repaid && "opacity-60",
        className,
      )}
    >
      {/* 좌측 아이콘 영역 */}
      <div className="relative flex shrink-0 items-center gap-2">
        {/* 카테고리 아이콘 / 색상 칩 */}
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-lg"
          style={{
            backgroundColor: entry.category_color
              ? `${entry.category_color}1f`
              : undefined,
            color: entry.category_color,
          }}
        >
          {entry.category_icon ?? (
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: entry.category_color }}
            />
          )}
        </span>
        {showFriend && entry.friend_name ? (
          <InitialAvatar
            name={entry.friend_name}
            size="sm"
            className="size-7 text-[10px]"
          />
        ) : null}
        {entry.is_repaid ? (
          <span
            aria-label="갚음"
            className="absolute -top-1 -left-1 inline-flex size-4 items-center justify-center rounded-full bg-brand-primary text-white ring-2 ring-card"
          >
            <Check className="size-3" />
          </span>
        ) : null}
      </div>

      {/* 가운데 본문 */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-relaxed text-foreground whitespace-pre-line">
          {entry.memo}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{dateLabel}</span>
          {entry.category_name ? (
            <>
              <span aria-hidden>·</span>
              <span>{entry.category_name}</span>
            </>
          ) : null}
          <span
            className="rounded-md border border-border px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground"
            aria-label={`보답 시점: ${timingBadge}`}
          >
            {timingBadge}
          </span>
          {showFriend && entry.friend_name ? (
            <span className="text-foreground/70">@ {entry.friend_name}</span>
          ) : null}
        </div>
      </div>

      {/* 우측 액션 */}
      <div className="flex shrink-0 items-center gap-0.5">
        <EntryFormDialog
          mode="edit"
          entry={entry}
          friendOptions={friendOptions}
          categoryOptions={categoryOptions}
          onSubmitAction={onUpdateAction}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="신세 수정"
            >
              <Pencil aria-hidden />
            </Button>
          }
        />
        <EntryDeleteDialog
          entry={entry}
          onConfirmAction={onDeleteAction}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="신세 삭제"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden />
            </Button>
          }
        />
      </div>
    </li>
  );
}
