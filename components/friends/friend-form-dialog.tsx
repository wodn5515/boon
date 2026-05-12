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
 * UI 골격 전용. 폼 액션은 worker 가 Server Action 으로 결합한다 (`<form action={...}>`).
 * 지금은 `onSubmit={(e) => e.preventDefault()}` 로 두어 dev 환경에서 페이지
 * 새로고침이 발생하지 않도록만 한다.
 *
 * 디자이너 자율 판단 (Lead 위임):
 *   - 폼 필드 순서: 이름 → 생일 (월/일) → 메모. PRD §3 의 항목 나열 순서와 일치.
 *   - 생일은 월·일 둘 다 선택해야 저장(둘 다 옵션이지만 한 쪽만 채울 수는 없음).
 *     이 룰은 V1 단순화 — worker 가 Server Action 에서 validation 으로 명시.
 *   - 저장 버튼 variant: 결정 로그 003 §G("default hover 미정") 를 따라
 *     `variant="default"` 대신 안전한 `variant="outline"` 으로 통일. 톤이
 *     안정화되면 default 로 교체 (worker 가 결정 로그에 기록).
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
  const submitLabel = isEdit ? "수정 저장" : "친구 추가";

  // worker 가 Server Action 으로 교체할 placeholder.
  // 현재 `<form>` 의 default submit 을 막아 새로고침 방지만 한다.
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
                <SelectTrigger className="w-full">
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
                <SelectTrigger className="w-full">
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

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                취소
              </Button>
            </DialogClose>
            {/*
             * 저장 버튼 variant: outline (결정 로그 003 §G 의 default hover 보류 정책).
             * worker 가 Server Action 결합 후 디자이너와 한 번 더 톤 점검.
             */}
            <Button type="submit" variant="outline">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
