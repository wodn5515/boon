"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { deleteFriend } from "@/app/(authenticated)/friends/actions";
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
import type { Friend } from "@/lib/friends/types";

/**
 * 친구 삭제 확인 모달 (PRD §3, D-017).
 *
 * 결정 로그 004 §C / Task 10-3:
 *   - 친구는 soft delete (`is_deleted = true`) — 받은 신세(entries) 는 DB 에 보존되지만
 *     화면에서는 사라진다. 모달 본문이 cascade 임팩트를 명시.
 *   - 액션은 `deleteFriend(id)` Server Action 호출. Server Action 안에서는 redirect 하지 않고
 *     클라이언트가 `useRouter().push("/friends")` 로 이동 (통합 테스트와 동시 호환).
 */

type FriendDeleteDialogProps = {
  friend: Friend;
  /** entries 슬라이스에서 집계해 결합. V1 골격에서는 placeholder 0. */
  entryCount?: number;
  trigger: React.ReactNode;
};

export function FriendDeleteDialog({
  friend,
  entryCount = 0,
  trigger,
}: FriendDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      await deleteFriend(friend.id);
      setOpen(false);
      router.push("/friends");
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
            이 친구를 삭제하시겠어요?
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{friend.name}</span>
            {" "}+ 받은 신세{" "}
            <span className="font-medium text-foreground">{entryCount}</span>
            개가 함께 사라집니다.
            <br />이 동작은 되돌리기 어렵습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
          삭제된 친구는 휴지통에 보관되지 않아요 (V1). 신중하게 삭제해 주세요.
        </div>

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
