"use client";

import * as React from "react";
import { Search, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * `/entries` 페이지 검색·필터 바 (결정 로그 008 §A·§C, 004 §D 패턴 확장).
 *
 * 두 행동을 한 컴포넌트에 결합:
 * 1) **즉시 클라이언트 필터** — 사용자가 input/select/date 를 변경하는 동안 `<ul>` 자식 `<li>` 의
 *    data-* 속성을 읽어 display:none/block 토글. EntryItem 이 노출하는 4개 속성을 매칭에 사용:
 *      · data-friend-id, data-category-id, data-received-date, data-memo
 * 2) **URL 동기화** — form action="/entries" method="get" 의 native submit 으로 `?q=...&friend=...`
 *    URL 로 navigate (RSC 친화 + 공유/북마크 가능). select 는 native `<select>` 라 hidden input 보강 불필요.
 *
 * 디자이너 자율 결정 (008):
 *   - **layout**: 모바일 1열 적층 / sm 이상 2열 grid / lg 이상 한 줄 — sticky 가능하지만 페이지 헤더와
 *     충돌 회피 위해 V1 은 sticky 미적용. 페이지가 짧으면 사용자 시선 안정.
 *   - **정렬 select** vs **toggle button**: native select 채택 — 모바일 OS 휠과 자연스럽고
 *     접근성 기본 제공.
 *   - **"초기화"**: 모든 필터를 비우고 `/entries` 로 단순 navigate (anchor link). reset form 대신
 *     URL clear 가 의도 명확.
 *
 * 친구 select 는 mock 결합 시 `friendOptions` 로 받으며, 본격 결합 시 listFriends 결과로 교체.
 */

export type EntriesFilterBarProps = {
  /** 페이지 ?q= 초기값. */
  initialQuery: string;
  /** 페이지 ?friend= 초기값. */
  initialFriendId: string;
  /** 페이지 ?category= 초기값. */
  initialCategoryId: string;
  /** 페이지 ?from= 초기값 (ISO YYYY-MM-DD). */
  initialFrom: string;
  /** 페이지 ?to= 초기값 (ISO YYYY-MM-DD). */
  initialTo: string;
  /** 페이지 ?sort= 초기값. */
  initialSort: "recent" | "oldest";
  /** 친구 선택지 (listFriends 결과 또는 mock). */
  friendOptions: ReadonlyArray<{ id: string; name: string }>;
  /** 카테고리 선택지 (listCategories 결과 또는 mock). */
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
  }>;
  /** 즉시 필터 대상 `<ul>` 의 DOM id. 자식 `<li data-*>` 만 토글된다. */
  targetListId: string;
  /** 페이지가 표시한 결과 카운트 — 즉시 필터 후 갱신을 위해 element id 를 받는다. */
  resultCountTargetId?: string;
};

const SELECT_BASE =
  "h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/50";

export function EntriesFilterBar({
  initialQuery,
  initialFriendId,
  initialCategoryId,
  initialFrom,
  initialTo,
  initialSort,
  friendOptions,
  categoryOptions,
  targetListId,
  resultCountTargetId,
}: EntriesFilterBarProps) {
  const [q, setQ] = React.useState(initialQuery);
  const [friendId, setFriendId] = React.useState(initialFriendId);
  const [categoryId, setCategoryId] = React.useState(initialCategoryId);
  const [from, setFrom] = React.useState(initialFrom);
  const [to, setTo] = React.useState(initialTo);
  const [sort, setSort] = React.useState<"recent" | "oldest">(initialSort);

  // 어떤 필터든 활성 상태인지 — "초기화" 버튼 노출 분기.
  const hasAnyFilter =
    q.trim().length > 0 ||
    friendId !== "" ||
    categoryId !== "" ||
    from !== "" ||
    to !== "" ||
    sort !== "recent";

  // 즉시 클라이언트 필터: state 가 바뀔 때마다 `<li>` data-* 매칭으로 display 토글.
  // URL 은 form submit (Enter) 시 갱신된다 (RSC 페이지 reload 와 자연 정합).
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const list = document.getElementById(targetListId);
    if (!list) return;
    const qLower = q.trim().toLowerCase();
    const items = list.querySelectorAll<HTMLLIElement>("li[data-entry-id]");

    let visibleCount = 0;
    items.forEach((li) => {
      const memo = (li.dataset.memo ?? "").toLowerCase();
      const fId = li.dataset.friendId ?? "";
      const cId = li.dataset.categoryId ?? "";
      const rd = li.dataset.receivedDate ?? "";

      const matchQ = qLower.length === 0 || memo.includes(qLower);
      const matchFriend = friendId === "" || fId === friendId;
      const matchCategory = categoryId === "" || cId === categoryId;
      const matchFrom = from === "" || rd >= from;
      const matchTo = to === "" || rd <= to;

      const visible =
        matchQ && matchFriend && matchCategory && matchFrom && matchTo;
      li.style.display = visible ? "" : "none";
      if (visible) visibleCount += 1;
    });

    // 정렬 토글은 DOM 순서 자체를 뒤집어 본격 RSC reload 없이도 사용자 인지 변화 제공.
    // (URL 동기화 시 서버가 정확한 순서로 재렌더. 즉시 토글은 회상 흐름 끊김 방지.)
    if (sort !== initialSort) {
      reorderEntries(list, sort);
    }

    // 결과 카운트 즉시 갱신.
    if (resultCountTargetId) {
      const target = document.getElementById(resultCountTargetId);
      if (target) target.textContent = `${visibleCount}건 표시 중`;
    }
  }, [q, friendId, categoryId, from, to, sort, targetListId, resultCountTargetId, initialSort]);

  return (
    <form
      action="/entries"
      method="get"
      className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label="신세 검색 및 필터"
    >
      {/* 1행: 검색 + 정렬 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메모에서 단어 찾기"
            aria-label="메모 검색"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <label htmlFor="entries-sort" className="text-xs text-muted-foreground sm:sr-only">
            정렬
          </label>
          <select
            id="entries-sort"
            name="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "oldest")}
            className={cn(SELECT_BASE, "w-full sm:w-32")}
            aria-label="정렬 순서"
          >
            <option value="recent">최근순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      </div>

      {/* 2행: 친구 / 카테고리 / 날짜 from / 날짜 to */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="entries-friend" className="text-xs text-muted-foreground">
            친구
          </label>
          <select
            id="entries-friend"
            name="friend"
            value={friendId}
            onChange={(e) => setFriendId(e.target.value)}
            className={SELECT_BASE}
          >
            <option value="">모든 친구</option>
            {friendOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entries-category" className="text-xs text-muted-foreground">
            카테고리
          </label>
          <select
            id="entries-category"
            name="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={SELECT_BASE}
          >
            <option value="">모든 카테고리</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entries-from" className="text-xs text-muted-foreground">
            받은 날짜 (시작)
          </label>
          <input
            id="entries-from"
            type="date"
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={SELECT_BASE}
            aria-label="받은 날짜 시작"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="entries-to" className="text-xs text-muted-foreground">
            받은 날짜 (끝)
          </label>
          <input
            id="entries-to"
            type="date"
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={SELECT_BASE}
            aria-label="받은 날짜 끝"
          />
        </div>
      </div>

      {/* 3행: 액션 */}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Enter 또는 적용 버튼을 누르면 URL 에 저장됩니다.
        </p>
        <div className="flex items-center gap-2">
          {hasAnyFilter ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <a href="/entries" aria-label="필터 초기화">
                <RotateCcw aria-hidden />
                초기화
              </a>
            </Button>
          ) : null}
          <Button type="submit" variant="outline" size="sm">
            적용
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * 즉시 정렬: 자식 `<li data-received-date data-entry-id>` 를 sort 방향에 맞춰 재배열한다.
 * URL submit 후 RSC 가 동일 순서로 재렌더하므로 화면 일관성 유지.
 */
function reorderEntries(list: HTMLElement, sort: "recent" | "oldest"): void {
  const items = Array.from(
    list.querySelectorAll<HTMLLIElement>("li[data-entry-id]"),
  );
  if (items.length < 2) return;
  const dir = sort === "oldest" ? 1 : -1;
  items.sort((a, b) => {
    const ra = a.dataset.receivedDate ?? "";
    const rb = b.dataset.receivedDate ?? "";
    if (ra !== rb) return ra < rb ? dir : -dir;
    // tiebreak: data-entry-id 사전순 — DB created_at 와 1:1 매칭은 못 하지만 시연 일관성용.
    const ia = a.dataset.entryId ?? "";
    const ib = b.dataset.entryId ?? "";
    if (ia !== ib) return ia < ib ? dir : -dir;
    return 0;
  });
  items.forEach((li) => list.appendChild(li));
}
