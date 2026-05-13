"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 친구 combobox — EntryFormDialog 의 친구 선택 필드 (PRD §3, D-015).
 *
 * 결정 로그 D-015 + 디자이너 자율 결정:
 *   - 입력 시 ilike 자동완성 — 현재 사용자의 친구 목록을 클라이언트 측에서 substring 필터.
 *   - 매칭이 0건이거나, 매칭은 있어도 정확히 같은 이름이 없으면
 *     "+ '○○○' 새 친구로 추가" 옵션이 항상 마지막에 노출 → 인라인 빠른 생성 (이름만).
 *   - 인라인 생성된 친구는 자동 선택되고, 외부 폼에는 `selectedFriendId` 가 비어 있어도
 *     `pendingNewFriendName` 으로 따로 전달돼 worker 의 createEntry 안에서 createFriend 까지 한 트랜잭션으로 처리.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - cmdk 패키지 미설치 — radix-ui Popover + 직접 구현. 의존성 추가 비용을 V1 골격에서 회피.
 *   - "최소 입력 글자" 없음 — 친구 수가 보통 적어 0글자에서도 전체 목록을 노출하는 편이
 *     "어? 친구 어디 갔지" 같은 멈칫을 줄인다. (대안: 1글자부터 필터 — 거절)
 *   - "+ 새 친구로 추가" 위치 = 항상 마지막 (정확 매칭이 있어도) — 사용자가 동명이인을 추가
 *     하고 싶을 수 있고 (D-016 핸들 충돌 정책과 정합), 위치가 흔들리지 않아 학습 비용이 낮음.
 *   - 인라인 빠른 생성 폼 필드 = 이름만 (생일·메모 없이) — 신세 추가 흐름의 "관성"을 끊지 않음.
 *     생일·메모는 친구 상세에서 채우게 유도.
 *   - 검증 = 빈 문자열·공백만은 거절 (trim 후 1자 이상). 길이 상한은 db 스키마 따라감.
 */

export type FriendComboboxOption = {
  id: string;
  name: string;
};

export type FriendComboboxValue = {
  /** 기존 친구 선택 시 채워짐. 인라인 새 친구 생성 시 null. */
  selectedFriendId: string | null;
  /** 인라인 빠른 생성 시 채워짐. 기존 친구 선택 시 null. */
  pendingNewFriendName: string | null;
};

export type FriendComboboxProps = {
  /** 현재 사용자의 친구 목록. mock 또는 실제 listFriends() 결과. */
  options: ReadonlyArray<FriendComboboxOption>;
  value: FriendComboboxValue;
  onChange: (next: FriendComboboxValue) => void;
  /** Server Action 결합용 hidden field name. 기본 "friend_id". */
  name?: string;
  /** 인라인 새 친구 이름 hidden field name. 기본 "new_friend_name". */
  newFriendNameField?: string;
  disabled?: boolean;
  /** 트리거 버튼 placeholder. */
  placeholder?: string;
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function FriendCombobox({
  options,
  value,
  onChange,
  name = "friend_id",
  newFriendNameField = "new_friend_name",
  disabled = false,
  placeholder = "친구를 선택하세요",
}: FriendComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // 닫힐 때 query 초기화 — 다음 오픈에서 깨끗하게.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = query.trim();
  const filtered = React.useMemo(() => {
    if (!trimmedQuery) return options;
    const re = new RegExp(escapeRegExp(trimmedQuery), "i");
    return options.filter((o) => re.test(o.name));
  }, [options, trimmedQuery]);

  const selected = value.selectedFriendId
    ? options.find((o) => o.id === value.selectedFriendId)
    : null;
  const pendingNew = value.pendingNewFriendName;

  function handleSelect(option: FriendComboboxOption) {
    onChange({ selectedFriendId: option.id, pendingNewFriendName: null });
    setOpen(false);
  }

  function handleCreateInline() {
    if (!trimmedQuery) return;
    onChange({ selectedFriendId: null, pendingNewFriendName: trimmedQuery });
    setOpen(false);
  }

  const triggerLabel = selected?.name
    ?? (pendingNew ? `${pendingNew} (새 친구)` : null);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="친구 선택"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !triggerLabel && "text-muted-foreground",
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2 truncate">
            {selected ? (
              <InitialAvatar name={selected.name} size="sm" className="size-5 text-[10px]" />
            ) : pendingNew ? (
              <span
                aria-hidden
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground"
              >
                <Plus className="size-3" />
              </span>
            ) : null}
            <span className="truncate">{triggerLabel ?? placeholder}</span>
          </span>
          <ChevronsUpDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </Button>
      </PopoverPrimitive.Trigger>

      {/* hidden inputs — 폼 submit 시 한쪽만 채워진다. */}
      <input
        type="hidden"
        name={name}
        value={value.selectedFriendId ?? ""}
        readOnly
      />
      <input
        type="hidden"
        name={newFriendNameField}
        value={value.pendingNewFriendName ?? ""}
        readOnly
      />

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // radix-ui Popover 의 기본 role 은 "dialog" — 본 combobox 컨테이너는 진짜 dialog 가 아니라
          // 자식 listbox 의 시각 컨테이너일 뿐이라 role 을 비워(presentation 으로 덮어) 두면
          // ARIA 트리에 dialog 가 추가로 생기지 않는다. 이렇게 두지 않으면 EntryFormDialog 와
          // 함께 `getByRole("dialog")` 가 매칭 2개로 strict-mode 충돌 (E2E 시나리오 1/3/4).
          role="presentation"
          className={cn(
            "z-50 w-(--radix-popover-trigger-width) min-w-56 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          {/* 검색 입력 */}
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <Input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="친구 이름 검색 또는 입력"
              aria-label="친구 이름 검색"
              className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <ul className="max-h-60 overflow-y-auto py-1" role="listbox">
            {filtered.length > 0 ? (
              filtered.map((option) => {
                const isSelected = option.id === value.selectedFriendId;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:bg-accent focus-visible:outline-none",
                      )}
                    >
                      <InitialAvatar name={option.name} size="sm" className="size-5 text-[10px]" />
                      <span className="flex-1 truncate">{option.name}</span>
                      {isSelected ? (
                        <Check
                          aria-hidden
                          className="size-4 text-brand-primary"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                일치하는 친구가 없어요
              </li>
            )}

            {/* 인라인 빠른 생성 옵션 — query 가 있을 때만 노출 */}
            {trimmedQuery ? (
              <li className="border-t border-border">
                <button
                  type="button"
                  onClick={handleCreateInline}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm",
                    "text-brand-primary hover:bg-accent",
                    "focus-visible:bg-accent focus-visible:outline-none",
                  )}
                >
                  <Plus aria-hidden className="size-4" />
                  <span className="truncate">
                    {/* 동명이인 케이스를 위해 정확 매칭이어도 그대로 노출 — 사용자가 새 친구로 추가 가능 */}
                    &lsquo;{trimmedQuery}&rsquo; 새 친구로 추가
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
