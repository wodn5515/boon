"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  FriendCombobox,
  type FriendComboboxOption,
  type FriendComboboxValue,
} from "@/components/entries/friend-combobox";
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
import {
  DEFAULT_REPAYMENT_TIMING,
  REPAYMENT_TIMING_OPTIONS,
  type Entry,
  type RepaymentTiming,
} from "@/lib/entries/types";

/**
 * 신세 추가/수정 모달 (PRD §3 신세 관리).
 *
 * 필드 (디자이너 결정 — Lead 위임):
 *   1) 친구 (combobox + 인라인 빠른 생성, D-015)
 *   2) 카테고리 (select, 아이콘 + 이름)
 *   3) 내용 메모 (textarea)
 *   4) 받은 날짜 (input type=date, 기본 = 오늘)
 *   5) 보답 시점 (select 4종, D-012). "특정 날짜" 선택 시 아래에 추가 date picker 노출.
 *
 * 결정 로그 D-017: 신세 hard delete — edit/create 둘 다 변경 후 router.refresh().
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 필드 순서: 친구 → 카테고리 → 메모 → 받은 날짜 → 보답 시점.
 *     "누가 무엇을 어떻게 언제 어떻게 갚나" 의 자연어 순서.
 *   - "특정 날짜" date picker = 보답 시점 select 바로 아래 inline 노출 (별도 모달 X).
 *     사용자가 select 와 date picker 를 한 호흡에 채울 수 있게.
 *   - 메모 placeholder = "어떤 신세였는지 적어주세요" — 신세 회상 톤.
 *   - 메모 줄 수 제한 = soft (rows=3, field-sizing-content 로 자동 늘어남, 글자수 상한 없음).
 *     V1 회상 노트 컨셉에서 사용자가 길게 쓸 수도 있으니 막지 않는다.
 *   - 받은 날짜 기본 = 오늘 (new Date().toISOString().slice(0, 10)).
 *   - 저장 버튼 variant="outline" (결정 로그 003 §G nova preset 정책).
 *
 * Server Action 결합 = worker. 본 슬라이스는 placeholder `createEntry` / `updateEntry`
 * 시그니처만 호출. 본 컴포넌트의 onSubmit 은 worker 가 connect 한다.
 */

type Mode = "create" | "edit";

export type EntryFormDialogProps = {
  mode: Mode;
  entry?: Entry;
  /** 친구 상세 페이지에서 호출 시 친구 미리 선택. */
  defaultFriendId?: string;
  /** 친구 combobox 옵션. worker 가 listFriends() 결과로 결합. */
  friendOptions: ReadonlyArray<FriendComboboxOption>;
  /** 카테고리 select 옵션. worker 가 listCategories() 결과로 결합. */
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  trigger: React.ReactNode;
  /**
   * Server Action 으로 폼 데이터를 처리.
   * worker 가 createEntry / updateEntry 를 inject. UI 골격에서는 placeholder fallback (noop).
   */
  onSubmitAction?: (formData: FormData) => Promise<void>;
};

function todayISODate(): string {
  // 로컬 자정 기준 YYYY-MM-DD — 사용자 인식의 "오늘" 과 정합.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function EntryFormDialog({
  mode,
  entry,
  defaultFriendId,
  friendOptions,
  categoryOptions,
  trigger,
  onSubmitAction,
}: EntryFormDialogProps) {
  const isEdit = mode === "edit";
  const title = isEdit ? "신세 수정" : "신세 추가";
  const description = isEdit
    ? "받은 신세의 내용을 업데이트해요."
    : "어떤 신세를 받았는지 기록해 보세요.";
  // 제목과 submit 버튼 텍스트 겹침 방지 (friends/categories 패턴 동일).
  const submitLabel = isEdit ? "수정 저장" : "신세 추가하기";

  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // 친구 combobox 상태
  const initialFriendValue: FriendComboboxValue = React.useMemo(
    () => ({
      selectedFriendId: entry?.friend_id ?? defaultFriendId ?? null,
      pendingNewFriendName: null,
    }),
    [entry?.friend_id, defaultFriendId],
  );
  const [friendValue, setFriendValue] = React.useState<FriendComboboxValue>(
    initialFriendValue,
  );

  // 보답 시점 — "특정 날짜" 분기에 date picker 추가 노출
  const [timing, setTiming] = React.useState<RepaymentTiming>(
    entry?.repayment_timing ?? DEFAULT_REPAYMENT_TIMING,
  );

  // 모달이 다시 열릴 때 초기값 동기화
  React.useEffect(() => {
    if (open) {
      setFriendValue(initialFriendValue);
      setTiming(entry?.repayment_timing ?? DEFAULT_REPAYMENT_TIMING);
      setError(null);
    }
  }, [open, initialFriendValue, entry?.repayment_timing]);

  const formKey = `${mode}-${entry?.id ?? "new"}-${open ? "1" : "0"}`;

  async function handleSubmit(formData: FormData) {
    setError(null);
    // 친구가 비어 있으면 (선택 안 됨 & 새 친구 이름 없음) 거절
    if (!friendValue.selectedFriendId && !friendValue.pendingNewFriendName) {
      setError("친구를 선택하거나 새로 추가해 주세요.");
      return;
    }
    // 보답 시점 = "특정 날짜" 인데 날짜 비어 있으면 거절
    if (timing === "specific_date" && !formData.get("repayment_specific_date")) {
      setError("특정 날짜를 선택해 주세요.");
      return;
    }
    setPending(true);
    try {
      if (isEdit && entry?.id) {
        formData.set("id", entry.id);
      }
      // worker 가 inject 한 Server Action 호출. UI 골격은 noop.
      if (onSubmitAction) {
        await onSubmitAction(formData);
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
          {/* 1) 친구 — combobox + 인라인 빠른 생성 */}
          <div className="grid gap-1.5">
            <Label>
              친구 <span className="text-destructive">*</span>
            </Label>
            <FriendCombobox
              options={friendOptions}
              value={friendValue}
              onChange={setFriendValue}
              placeholder="친구를 선택하거나 새로 추가하세요"
            />
            <p className="text-xs text-muted-foreground">
              목록에 없으면 이름을 입력 후 &lsquo;새 친구로 추가&rsquo; 를 눌러
              바로 만들 수 있어요.
            </p>
          </div>

          {/* 2) 카테고리 — select */}
          <div className="grid gap-1.5">
            <Label htmlFor="entry-category">
              카테고리 <span className="text-destructive">*</span>
            </Label>
            <Select
              name="category_id"
              defaultValue={entry?.category_id ?? categoryOptions[0]?.id}
              required
            >
              <SelectTrigger
                id="entry-category"
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

          {/* 3) 내용 메모 — textarea */}
          <div className="grid gap-1.5">
            <Label htmlFor="entry-memo">
              내용 메모 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="entry-memo"
              name="memo"
              required
              defaultValue={entry?.memo ?? ""}
              placeholder="어떤 신세였는지 적어주세요"
              rows={3}
            />
          </div>

          {/* 4) 받은 날짜 — date picker (input type=date) */}
          <div className="grid gap-1.5">
            <Label htmlFor="entry-received-date">받은 날짜</Label>
            <Input
              id="entry-received-date"
              name="received_date"
              type="date"
              required
              defaultValue={entry?.received_date ?? todayISODate()}
              className="w-full"
            />
          </div>

          {/* 5) 보답 시점 — select 4종 + 특정 날짜 분기 */}
          <div className="grid gap-1.5">
            <Label htmlFor="entry-repayment-timing">보답 시점</Label>
            <Select
              name="repayment_timing"
              value={timing}
              onValueChange={(v) => setTiming(v as RepaymentTiming)}
            >
              <SelectTrigger
                id="entry-repayment-timing"
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

            {timing === "specific_date" ? (
              <div className="mt-1 grid gap-1.5">
                <Label htmlFor="entry-repayment-specific-date" className="text-xs text-muted-foreground">
                  갚을 날짜
                </Label>
                <Input
                  id="entry-repayment-specific-date"
                  name="repayment_specific_date"
                  type="date"
                  defaultValue={entry?.repayment_specific_date ?? ""}
                  className="w-full"
                  // 사용자가 "특정 날짜" 를 골랐을 때 비어 있으면 handleSubmit 에서 거절.
                />
              </div>
            ) : (
              // 다른 시점일 때도 폼 키에 동일 name 을 항상 두면 update 의 reset 의도 전달이 깔끔.
              <input
                type="hidden"
                name="repayment_specific_date"
                value=""
                readOnly
              />
            )}
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
