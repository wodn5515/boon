"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  createFriend,
  updateFriend,
} from "@/app/(authenticated)/friends/actions";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Friend } from "@/lib/friends/types";

/**
 * 친구 추가/수정 모달 (PRD §3 친구 관리).
 *
 * 결정 로그 004 §B / Task 10-3:
 *   - 폼은 Server Action(createFriend / updateFriend) 에 결합.
 *   - 성공 시 모달이 닫히고 router.refresh() 로 페이지가 revalidate 된다.
 *   - 실패 시 카드 안에 에러 메시지를 보여준다 (useFormState 대신 try/catch + state).
 *
 * 디자이너 결정 (003 §G / 004 §E):
 *   - 폼 필드 순서: 이름 → 생일(월/일) → 메모.
 *   - 생일은 월·일 둘 다 선택해야 저장(Server Action 단에서 한 쪽만이면 둘 다 null 처리).
 *   - 저장 버튼 variant="outline" — nova preset 정책.
 */

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

type Mode = "create" | "edit";

type FriendFormDialogProps = {
  mode: Mode;
  friend?: Friend;
  trigger: React.ReactNode;
};

export function FriendFormDialog({ mode, friend, trigger }: FriendFormDialogProps) {
  const isEdit = mode === "edit";
  const title = isEdit ? "친구 정보 수정" : "친구 추가";
  const description = isEdit
    ? "친구 정보를 업데이트해요."
    : "이름은 필수, 생일과 메모는 나중에 채워도 괜찮아요.";
  // 제목 "친구 추가" 와 submit 버튼 텍스트가 정확히 같으면 spec 의
  // `dialog.getByText("친구 추가", { exact: true })` 가 둘에 매칭돼 strict-mode 에러가 난다.
  // submit 은 "친구 추가하기" 로 — 정규식 /친구 추가/ 매칭은 그대로 유지.
  const submitLabel = isEdit ? "수정 저장" : "친구 추가하기";

  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // edit 모드에서 모달이 다시 열릴 때 prop 변화에 맞춰 input 의 defaultValue 가 적용되도록
  // key 를 mode + friend.id + open 의 조합으로 둔다. (React 가 form 을 새 인스턴스로 만든다)
  const formKey = `${mode}-${friend?.id ?? "new"}-${open ? "1" : "0"}`;

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      if (isEdit) {
        if (!friend?.id) throw new Error("수정 대상 친구 ID 가 없어요.");
        formData.set("id", friend.id);
        await updateFriend(formData);
      } else {
        await createFriend(formData);
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
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) setError(null);
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form key={formKey} action={handleSubmit} className="flex flex-col gap-4">
          {/* 이름 (필수) */}
          <div className="grid gap-1.5">
            <Label htmlFor="friend-name">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="friend-name"
              name="name"
              type="text"
              required
              defaultValue={friend?.name ?? ""}
              placeholder="예) 김민준"
              autoComplete="off"
            />
          </div>

          {/* 생일 (옵션, 월+일 함께 선택) */}
          <div className="grid gap-1.5">
            <Label>생일 (선택)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                name="birthday_month"
                defaultValue={friend?.birthday_month?.toString()}
              >
                <SelectTrigger className="w-full" aria-label="월">
                  <SelectValue placeholder="월" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {m}월
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                name="birthday_day"
                defaultValue={friend?.birthday_day?.toString()}
              >
                <SelectTrigger className="w-full" aria-label="일">
                  <SelectValue placeholder="일" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d} value={d.toString()}>
                      {d}일
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              월·일 둘 다 선택해야 저장돼요.
            </p>
          </div>

          {/* 메모 (옵션) */}
          <div className="grid gap-1.5">
            <Label htmlFor="friend-note">메모 (선택)</Label>
            <Textarea
              id="friend-note"
              name="note"
              defaultValue={friend?.note ?? ""}
              placeholder="이 친구에 대해 기억하고 싶은 것"
              rows={3}
            />
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
