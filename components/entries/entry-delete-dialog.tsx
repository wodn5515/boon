"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Entry } from "@/lib/entries/types";

/**
 * 신세 삭제 확인 모달 (PRD §3, D-017).
 *
 * 결정 로그 D-017: 신세는 hard delete — 휴지통 없음. 카테고리·친구 삭제와 달리 entries 는
 * 회상 노트의 한 항목이라 사용자가 "이 한 줄을 지운다" 의 결정이 명확하다고 봤다.
 *
 * 친구 삭제 (soft delete, cascade) 와 다르게 모달 본문이 단순:
 *   - 어떤 신세인지 메모 1~2 줄 미리보기
 *   - 영구 삭제 경고
 *
 * Server Action `deleteEntry(id)` 결합 = worker. 본 컴포넌트는 prop 으로 inject 받는다.
 */

type EntryDeleteDialogProps = {
  entry: Entry;
  trigger: React.ReactNode;
  /** worker 가 deleteEntry Server Action 을 inject. UI 골격은 noop. */
  onConfirmAction?: (id: string) => Promise<void>;
};

export function EntryDeleteDialog({
  entry,
  trigger,
  onConfirmAction,
}: EntryDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // 메모 1~2 줄 미리보기 — 너무 길면 잘라낸다 (디자이너 결정: 80자 컷, 단순 문자 슬라이스).
  const memoPreview =
    entry.memo.length > 80 ? `${entry.memo.slice(0, 80).trim()}…` : entry.memo;

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      if (onConfirmAction) {
        await onConfirmAction(entry.id);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제에 실패했어요.";
      setError(msg);
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            이 신세를 삭제하시겠어요?
          </DialogTitle>
          <DialogDescription>
            한 번 삭제하면 되돌릴 수 없어요 (휴지통 없음).
          </DialogDescription>
        </DialogHeader>

        {/* 메모 미리보기 — 회상 노트의 톤으로 인용 박스 */}
        <blockquote className="rounded-md border-l-4 border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground/80">
          <p className="line-clamp-3 whitespace-pre-line">{memoPreview}</p>
          {entry.friend_name || entry.category_name ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {entry.friend_name ? `${entry.friend_name}` : null}
              {entry.friend_name && entry.category_name ? " · " : null}
              {entry.category_name ?? null}
            </p>
          ) : null}
        </blockquote>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              취소
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "삭제 중…" : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
