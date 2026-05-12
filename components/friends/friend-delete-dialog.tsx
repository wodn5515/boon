"use client";

import * as React from "react";

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
 * 친구 삭제 확인 모달.
 *
 * 결정 로그 D-017 "친구 soft delete + cascade UI 알림" 를 따라:
 *   - 친구는 soft delete (`is_deleted = true`) 되지만, 화면상에서는 해당 친구
 *     + 그 친구에게 받은 신세(entries) 가 모두 사라진다.
 *   - cascade 임팩트를 모달 본문으로 명확히 안내해 실수 삭제를 줄인다.
 *
 * 액션은 worker 가 Server Action(`deleteFriend(id)`) 으로 결합한다. 현재는
 * placeholder 버튼이다.
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
  return (
    <Dialog>
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

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              취소
            </Button>
          </DialogClose>
          {/* worker 가 Server Action 으로 onClick 결합. 현재는 placeholder. */}
          <Button type="button" variant="destructive">
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
