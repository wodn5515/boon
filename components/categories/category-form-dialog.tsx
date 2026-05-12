"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import {
  createCategory,
  updateCategory,
} from "@/app/(authenticated)/settings/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORY_COLOR_POOL,
  DEFAULT_CATEGORY_COLOR,
  type Category,
} from "@/lib/categories/types";
import { cn } from "@/lib/utils";

/**
 * 카테고리 추가/수정 모달 (PRD §3, D-009/D-018).
 *
 * 필드:
 *   1) 이름 (필수, Input)
 *   2) 아이콘 (옵션, Input maxLength=2 — 이모지 1자 또는 빈 값)
 *   3) 색상 (8칸 칩 그리드, 기본 brand-primary)
 *
 * 시스템 카테고리(is_system=true)는 수정 모달에서:
 *   - 이름만 수정 가능
 *   - 아이콘·색상 입력은 disabled + 안내 문구 노출 ("기본 카테고리는 이름만 변경할 수 있어요")
 *
 * 결정 로그 003 §G / 004 §E-5: 저장 버튼 variant="outline" (nova preset 정책).
 *
 * Server Action 결합은 worker 영역. 본 슬라이스는 placeholder
 * `createCategory` / `updateCategory` 시그니처만 호출한다.
 */

type Mode = "create" | "edit";

type CategoryFormDialogProps = {
  mode: Mode;
  category?: Category;
  trigger: React.ReactNode;
};

export function CategoryFormDialog({
  mode,
  category,
  trigger,
}: CategoryFormDialogProps) {
  const isEdit = mode === "edit";
  const isSystem = isEdit && category?.is_system === true;

  const title = isEdit ? "카테고리 수정" : "카테고리 추가";
  const description = isSystem
    ? "기본 카테고리는 이름만 변경할 수 있어요."
    : isEdit
    ? "카테고리 정보를 업데이트해요."
    : "이름은 필수, 아이콘과 색상은 골라서 꾸며보세요.";
  // 제목과 submit 버튼 텍스트가 정확히 같으면 dialog 내 strict-mode 매칭이 겹친다 (friends 패턴 참조).
  const submitLabel = isEdit ? "수정 저장" : "카테고리 추가하기";

  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [color, setColor] = React.useState<string>(
    category?.color ?? DEFAULT_CATEGORY_COLOR,
  );

  // 모달이 다시 열릴 때 외부 prop 변화에 맞춰 초기값을 동기화.
  React.useEffect(() => {
    if (open) {
      setColor(category?.color ?? DEFAULT_CATEGORY_COLOR);
      setError(null);
    }
  }, [open, category?.color]);

  const formKey = `${mode}-${category?.id ?? "new"}-${open ? "1" : "0"}`;

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      // 시스템 카테고리는 이름만 보내고, 색상·아이콘은 원본 그대로 유지하도록 서버에서 무시.
      formData.set("color", color);
      if (isEdit) {
        if (!category?.id) throw new Error("수정 대상 카테고리 ID 가 없어요.");
        formData.set("id", category.id);
        await updateCategory(formData);
      } else {
        await createCategory(formData);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "저장에 실패했어요.";
      setError(msg);
    } finally {
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          key={formKey}
          action={handleSubmit}
          className="flex flex-col gap-4"
        >
          {/* 이름 (필수) */}
          <div className="grid gap-1.5">
            <Label htmlFor="category-name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="category-name"
              name="name"
              type="text"
              required
              maxLength={20}
              defaultValue={category?.name ?? ""}
              placeholder="예) 밥·음료"
              autoComplete="off"
            />
          </div>

          {/* 아이콘 (옵션) — 시스템 카테고리면 disabled */}
          <div className="grid gap-1.5">
            <Label htmlFor="category-icon">아이콘 (선택, 이모지 1자)</Label>
            <Input
              id="category-icon"
              name="icon"
              type="text"
              maxLength={2}
              defaultValue={category?.icon ?? ""}
              placeholder="예) 🍚"
              disabled={isSystem}
              autoComplete="off"
              className="w-24 text-center text-lg"
            />
            <p className="text-xs text-muted-foreground">
              비워두면 색상 칩으로 표시돼요.
            </p>
          </div>

          {/* 색상 (옵션, 그리드) — 시스템 카테고리면 disabled */}
          <div className="grid gap-1.5">
            <Label>색상</Label>
            <div
              role="radiogroup"
              aria-label="카테고리 색상"
              aria-disabled={isSystem || undefined}
              className={cn(
                "grid grid-cols-4 gap-2",
                isSystem && "pointer-events-none opacity-50",
              )}
            >
              {CATEGORY_COLOR_POOL.map((c) => {
                const selected = c.value === color;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={c.label}
                    disabled={isSystem}
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-md border-2 transition-all",
                      "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-foreground"
                        : "border-transparent hover:border-foreground/20",
                    )}
                    style={{ backgroundColor: c.value }}
                  >
                    {selected ? (
                      <Check
                        aria-hidden
                        className="size-4 text-white drop-shadow"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {/* hidden input 으로 form 에 색상 값을 같이 보낸다 (handleSubmit 에서도 set 함). */}
            <input type="hidden" name="color" value={color} readOnly />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                취소
              </Button>
            </DialogClose>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "저장 중…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
