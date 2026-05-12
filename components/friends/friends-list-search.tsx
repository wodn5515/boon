"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * 친구 목록 검색 입력 (Task 10-1, 004 §D).
 *
 * 두 가지 행동을 결합:
 * 1) **즉시 클라이언트 필터** — 사용자가 타이핑하는 동안 자식 카드 그리드의 li 항목을
 *    data-friend-name 속성과 비교해 display:none/block 으로 숨기거나 보여준다.
 *    E2E 시나리오 6 이 fill 직후 매칭 카드만 보이길 기대해 즉시 반영이 필요.
 * 2) **URL 동기화** — Enter / form submit 시 `/friends?q=...` 로 navigate (RSC 친화, 공유 가능 URL).
 *    초기 q searchParams 도 input 의 defaultValue 로 받아들이고 자식 필터를 적용한다.
 *
 * 카드 그리드는 server component 가 그대로 렌더하고, 이 input 은 그 옆에 떠 있다.
 * 자식 li 들은 `data-friend-name` 으로 이름을 노출한다 (page.tsx 에서 attach).
 */

type FriendsListSearchProps = {
  /** /friends 페이지의 ?q= 초기값. */
  initialQuery: string;
  /** 자식 카드 그리드 ul 의 id — 이 id 의 자식 li 만 필터 대상. */
  targetListId: string;
};

export function FriendsListSearch({
  initialQuery,
  targetListId,
}: FriendsListSearchProps) {
  const [value, setValue] = React.useState(initialQuery);
  const inputId = React.useId();

  // value 변화 시 자식 li 표시/숨김 적용.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const list = document.getElementById(targetListId);
    if (!list) return;
    const q = value.trim().toLowerCase();
    const items = list.querySelectorAll<HTMLLIElement>("li[data-friend-name]");
    items.forEach((li) => {
      const name = (li.dataset.friendName ?? "").toLowerCase();
      const match = q.length === 0 || name.includes(q);
      li.style.display = match ? "" : "none";
    });
  }, [value, targetListId]);

  // Enter (form submit) 시 URL 도 갱신해 공유/북마크 가능. method="get" 으로 동작.
  return (
    <form action="/friends" method="get" className="mt-6">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={inputId}
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="이름으로 검색"
          aria-label="친구 이름 검색"
          className="pl-9"
        />
      </div>
    </form>
  );
}
