"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { deleteCategory } from "@/app/(authenticated)/settings/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/lib/categories/types";

/**
 * 카테고리 삭제 확인 모달 (PRD §3, D-018).
 *
 * 분기:
 *   - entryCount === 0: "이 카테고리를 삭제하시겠어요?" + 삭제 버튼 (destructive)
 *   - entryCount > 0: "이 카테고리에 신세 N개가 있어요. 어디로 옮길까요?"
 *                     + 카테고리 select (이전 대상)
 *                     + "이전 후 삭제" 버튼
 *
 * 시스템 카테고리(is_system=true)는 이 모달 자체가 trigger 되지 않는다
 * (CategoryItem 에서 삭제 버튼 hidden). 따라서 본 컴포넌트는 사용자 카테고리만 가정.
 *
 * V1 골격에서 entryCount 는 항상 0 placeholder. entries 슬라이스에서 실제 결합되며
 * `migrateTargetCategories` 도 그때 채워진다.
 */

type CategoryDeleteDialogProps = {
  category: Category;
  /** entries 슬라이스에서 집계해 결합. V1 골격에선 0 placeholder. */
  entryCount?: number;
  /** 이전 대상 후보 카테고리. V1 골격에선 빈 배열 placeholder — worker 가 결합. */
  migrateTargets?: Category[];
  trigger: React.ReactNode;
};

export function CategoryDeleteDialog({
  category,
  entryCount = 0,
  migrateTargets = [],
  trigger,
}: CategoryDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string>("");

  const hasEntries = entryCount > 0;

  async function handleConfirm() {
    setError(null);
    if (hasEntries && !targetId) {
      setError("이전할 카테고리를 선택해 주세요.");
      return;
    }
    setPending(true);
    try {
      await deleteCategory({
        id: category.id,
        migrateTo: hasEntries ? targetId : null,
      });
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
        if (!next) {
          setError(null);
          setTargetId("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            {hasEntries
              ? "이 카테고리에 신세가 남아 있어요"
              : "이 카테고리를 삭제하시겠어요?"}
          </DialogTitle>
          <DialogDescription>
            {hasEntries ? (
              <>
                <span className="font-medium text-foreground">
                  {category.name}
                </span>
                에 신세{" "}
                <span className="font-medium text-foreground">
                  {entryCount}
                </span>
                개가 있어요. 어디로 옮길까요?
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {category.name}
                </span>{" "}
                카테고리를 삭제합니다. 되돌릴 수 없어요.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasEntries ? (
          <div className="grid gap-1.5">
            <label
              htmlFor="migrate-target"
              className="text-xs font-medium text-foreground"
            >
              이전 대상 카테고리
            </label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger
                id="migrate-target"
                className="w-full"
                aria-label="이전 대상 카테고리"
              >
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {migrateTargets.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    옮길 다른 카테고리가 없어요
                  </div>
                ) : (
                  migrateTargets.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              이전 후 이 카테고리는 삭제돼요.
            </p>
          </div>
        ) : null}

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
            {pending
              ? "삭제 중…"
              : hasEntries
              ? "이전 후 삭제"
              : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
