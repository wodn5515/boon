"use client";

import * as React from "react";
import { UserPlus, Users, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatReceivedDate } from "@/lib/entries/types";
import type {
  MatchResult,
  NormalizedRow,
  RowDecision,
  RowDecisionKind,
} from "@/lib/import/types";
import { cn } from "@/lib/utils";

/**
 * Step 4 — 친구 매칭 검토 (PRD §3, D-026 핵심).
 *
 * 50~200 row 시나리오의 검토 화면. row 별 3가지 분기:
 *   - 0건 매칭 (new)            → "새 친구로 추가" 자동 + included 토글 노출.
 *   - 1건 매칭 (single)         → 매칭된 친구 카드(메모·최근 신세) + "같은 사람" 체크.
 *                                  해제 시 새 친구로 추가.
 *   - 다건 매칭 (multiple)      → 후보 라디오 + "새 친구로 만들기" 옵션.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 일괄 액션 헤더: 전체 included on/off + "모든 단일 매칭 확정" 단축 — 검토 시간 단축.
 *   - row 별 배지 색상:
 *       new = 노란빛(accent) / single = 연한 초록 / multiple = 주황 톤(주의 필요)
 *   - 친구 메모·최근 신세는 1건 매칭에서 인라인 카드로 펼침. 다건은 라디오 라벨에 한 줄로.
 *   - 가상 스크롤 도입 X — 200 row 정도면 React 가 무리없이 렌더, 부채/복잡도 낮춤.
 *
 * 거절된 대안:
 *   - 자동 확정 (1건 매칭 자동 확정) — D-026 의 "같은 사람?" 명시 확인 요구를 위배.
 *     사용자가 한 번 보고 결정하는 게 본 단계의 핵심 가치.
 *   - 페이지네이션 — 50~200 row 면 한 페이지가 더 빠름.
 */

export type Step4MatchingReviewProps = {
  /** Step 1·2 결과 + 이름 매핑으로 만든 정규화된 row 들 (rowIndex 정렬). */
  normalizedRows: ReadonlyArray<NormalizedRow>;
  /** matchFriendsByName 결과 또는 mock. rowIndex 로 normalizedRows 와 연결. */
  matchResults: ReadonlyArray<MatchResult>;
  /** 뒤로 가서 다시 들어왔을 때 결정 복원. */
  initialDecisions?: ReadonlyMap<number, RowDecision>;
  onBack: () => void;
  onNext: (decisions: ReadonlyMap<number, RowDecision>) => void;
};

/** 매칭 결과에서 row 별 초기 결정 — D-026 정책 그대로. */
function initialDecisionFor(result: MatchResult): RowDecision {
  if (result.candidates.length === 0) {
    return {
      rowIndex: result.rowIndex,
      kind: "new",
      selectedFriendId: null,
      included: true,
    };
  }
  if (result.candidates.length === 1) {
    // 단일 매칭은 "같은 사람" 체크 안 된 상태로 시작 — 사용자가 직접 명시 확인 (D-026).
    return {
      rowIndex: result.rowIndex,
      kind: "single-rejected",
      selectedFriendId: null,
      included: true,
    };
  }
  // 다건 — 기본은 아무것도 선택 안 됨. 사용자가 라디오로 선택해야 진행 가능.
  return {
    rowIndex: result.rowIndex,
    kind: "multiple-new",
    selectedFriendId: null,
    included: true,
  };
}

export function Step4MatchingReview({
  normalizedRows,
  matchResults,
  initialDecisions,
  onBack,
  onNext,
}: Step4MatchingReviewProps) {
  // rowIndex → MatchResult / Decision 맵.
  const matchByIndex = React.useMemo(() => {
    const m = new Map<number, MatchResult>();
    for (const r of matchResults) m.set(r.rowIndex, r);
    return m;
  }, [matchResults]);

  const [decisions, setDecisions] = React.useState<Map<number, RowDecision>>(
    () => {
      const m = new Map<number, RowDecision>();
      for (const row of normalizedRows) {
        const restored = initialDecisions?.get(row.rowIndex);
        if (restored) {
          m.set(row.rowIndex, restored);
          continue;
        }
        const match = matchByIndex.get(row.rowIndex);
        if (!match) {
          m.set(row.rowIndex, {
            rowIndex: row.rowIndex,
            kind: "new",
            selectedFriendId: null,
            included: true,
          });
        } else {
          m.set(row.rowIndex, initialDecisionFor(match));
        }
      }
      return m;
    },
  );

  function patch(rowIndex: number, next: Partial<RowDecision>) {
    setDecisions((prev) => {
      const cur = prev.get(rowIndex);
      if (!cur) return prev;
      const merged = new Map(prev);
      merged.set(rowIndex, { ...cur, ...next });
      return merged;
    });
  }

  // 일괄 액션
  function bulkSetIncluded(included: boolean) {
    setDecisions((prev) => {
      const next = new Map<number, RowDecision>();
      for (const [k, v] of prev) next.set(k, { ...v, included });
      return next;
    });
  }

  function bulkConfirmAllSingles() {
    // "같은 사람" 체크를 모든 단일 매칭에 자동 적용.
    setDecisions((prev) => {
      const next = new Map<number, RowDecision>();
      for (const [k, v] of prev) {
        const match = matchByIndex.get(k);
        if (match && match.candidates.length === 1) {
          next.set(k, {
            ...v,
            kind: "single-confirmed",
            selectedFriendId: match.candidates[0].friend_id,
          });
        } else {
          next.set(k, v);
        }
      }
      return next;
    });
  }

  // 진행 가능 조건: 모든 included row 가 다음 중 하나
  //   - new / single-confirmed / single-rejected / multiple-new (의도된 새 친구) /
  //     multiple-pick (선택된 friend_id 있음).
  // 정확히 말해, 다건 매칭 row 가 included 인데 사용자가 어떤 라디오도 안 골랐다면 막힘 X (multiple-new 가 기본 = 새 친구).
  // → 별다른 차단 조건 없음. 단, included 가 모두 false 면 import 할 게 없으니 막는다.
  const includedCount = React.useMemo(
    () => Array.from(decisions.values()).filter((d) => d.included).length,
    [decisions],
  );
  const allIncluded = includedCount === decisions.size;
  const noneIncluded = includedCount === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        한 명씩 살펴보세요. 이미 추가된 친구와 같은 사람이면 체크, 동명이인이면 새 친구로 추가돼요.
      </p>

      {/* 일괄 액션 헤더 */}
      <Card size="sm" className="flex-row items-center justify-between gap-3 p-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <Checkbox
            checked={
              noneIncluded ? false : allIncluded ? true : "indeterminate"
            }
            onCheckedChange={(v) => bulkSetIncluded(Boolean(v))}
            aria-label="모든 행 포함/제외"
          />
          <span className="text-muted-foreground">
            전체 포함{" "}
            <span className="font-medium text-foreground">
              {includedCount}/{decisions.size}
            </span>
          </span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={bulkConfirmAllSingles}
          className="text-xs"
        >
          단일 매칭 모두 확정
        </Button>
      </Card>

      {/* row 목록 */}
      <ul className="flex flex-col gap-2">
        {normalizedRows.map((row) => {
          const match = matchByIndex.get(row.rowIndex);
          const decision = decisions.get(row.rowIndex);
          if (!match || !decision) return null;
          return (
            <li key={row.rowIndex}>
              <RowReviewCard
                row={row}
                match={match}
                decision={decision}
                onPatch={(p) => patch(row.rowIndex, p)}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={noneIncluded}
          onClick={() => onNext(decisions)}
        >
          다음 — 미리보기 ({includedCount}건)
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// RowReviewCard — row 한 줄의 카드 (3 분기)
// ============================================================

type RowReviewCardProps = {
  row: NormalizedRow;
  match: MatchResult;
  decision: RowDecision;
  onPatch: (next: Partial<RowDecision>) => void;
};

function RowReviewCard({ row, match, decision, onPatch }: RowReviewCardProps) {
  const count = match.candidates.length;
  const badge: { label: string; kind: "new" | "single" | "multiple"; icon: React.ReactNode } =
    count === 0
      ? { label: "새 친구로 추가", kind: "new", icon: <UserPlus className="size-3" /> }
      : count === 1
        ? {
            label: decision.kind === "single-confirmed" ? "같은 사람" : "1명 매칭",
            kind: "single",
            icon: <UserCheck className="size-3" />,
          }
        : {
            label: `${count}명 매칭 (동명이인)`,
            kind: "multiple",
            icon: <Users className="size-3" />,
          };

  return (
    <Card
      size="sm"
      className={cn(
        "gap-3 p-3 transition-opacity",
        !decision.included && "opacity-50",
      )}
    >
      {/* row 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <InitialAvatar name={row.name} size="sm" className="size-7 text-[11px]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.amount ? `${formatAmount(row.amount)}` : null, row.note]
                .filter(Boolean)
                .join(" · ") || "추가 정보 없음"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              badge.kind === "new" && "bg-accent text-accent-foreground",
              badge.kind === "single" && "bg-primary/15 text-primary",
              badge.kind === "multiple" && "bg-chart-4/30 text-foreground",
            )}
            aria-label={`매칭 결과: ${badge.label}`}
          >
            {badge.icon}
            {badge.label}
          </span>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={decision.included}
              onCheckedChange={(v) => onPatch({ included: Boolean(v) })}
              aria-label={`${row.name} 포함`}
            />
            포함
          </label>
        </div>
      </div>

      {/* 분기별 본문 */}
      {count === 0 ? (
        <RowBodyNew name={row.name} />
      ) : count === 1 ? (
        <RowBodySingle
          candidate={match.candidates[0]}
          decision={decision}
          onPatch={onPatch}
        />
      ) : (
        <RowBodyMultiple
          name={row.name}
          candidates={match.candidates}
          decision={decision}
          onPatch={onPatch}
        />
      )}
    </Card>
  );
}

function RowBodyNew({ name }: { name: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">&lsquo;{name}&rsquo;</span>{" "}
      이름의 친구가 아직 없어요. 새 친구로 함께 추가돼요.
    </div>
  );
}

function RowBodySingle({
  candidate,
  decision,
  onPatch,
}: {
  candidate: MatchResult["candidates"][number];
  decision: RowDecision;
  onPatch: (next: Partial<RowDecision>) => void;
}) {
  const isSame = decision.kind === "single-confirmed";
  return (
    <div className="rounded-md border border-border bg-accent/10 p-3">
      <div className="flex items-start gap-2">
        <InitialAvatar
          name={candidate.friend_name}
          size="sm"
          className="size-7 text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {candidate.friend_name}
          </p>
          {candidate.friend_note ? (
            <p className="truncate text-xs text-muted-foreground">
              메모: {candidate.friend_note}
            </p>
          ) : null}
          {candidate.recent_entry_memo && candidate.recent_entry_date ? (
            <p className="truncate text-xs text-muted-foreground">
              최근 신세 · {formatReceivedDate(candidate.recent_entry_date)} ·{" "}
              {candidate.recent_entry_memo}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">아직 받은 신세 기록 없음</p>
          )}
        </div>
      </div>
      <label className="mt-2 inline-flex items-center gap-1.5 text-xs">
        <Checkbox
          checked={isSame}
          onCheckedChange={(v) =>
            onPatch(
              v
                ? {
                    kind: "single-confirmed",
                    selectedFriendId: candidate.friend_id,
                  }
                : { kind: "single-rejected", selectedFriendId: null },
            )
          }
          aria-label="같은 사람 확인"
        />
        <span className={cn(isSame ? "font-medium text-foreground" : "text-muted-foreground")}>
          같은 사람이에요 — 이 친구에게 신세 추가
        </span>
      </label>
      {!isSame ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          체크 안 하면 동명이인으로 보고 새 친구로 추가돼요.
        </p>
      ) : null}
    </div>
  );
}

function RowBodyMultiple({
  name,
  candidates,
  decision,
  onPatch,
}: {
  name: string;
  candidates: MatchResult["candidates"];
  decision: RowDecision;
  onPatch: (next: Partial<RowDecision>) => void;
}) {
  // RadioGroup value: "new" 또는 candidate.friend_id.
  const value =
    decision.kind === "multiple-pick" && decision.selectedFriendId
      ? decision.selectedFriendId
      : "new";

  function handleChange(next: string) {
    if (next === "new") {
      onPatch({ kind: "multiple-new", selectedFriendId: null });
    } else {
      onPatch({ kind: "multiple-pick", selectedFriendId: next });
    }
  }

  return (
    <div className="rounded-md border border-border bg-chart-4/10 p-3">
      <p className="text-xs text-muted-foreground">
        같은 이름의 친구가 {candidates.length}명 있어요. 누구인지 골라 주세요.
      </p>
      <RadioGroup
        value={value}
        onValueChange={handleChange}
        className="mt-2 gap-1.5"
      >
        {candidates.map((c) => {
          const inputId = `match-${decision.rowIndex}-${c.friend_id}`;
          return (
            <label
              key={c.friend_id}
              htmlFor={inputId}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/30"
            >
              <RadioGroupItem id={inputId} value={c.friend_id} className="mt-1" />
              <span className="flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {c.friend_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.friend_note ?? "메모 없음"}
                  {c.recent_entry_date
                    ? ` · 최근 ${formatReceivedDate(c.recent_entry_date)}${
                        c.recent_entry_memo ? ` · ${c.recent_entry_memo}` : ""
                      }`
                    : ""}
                </span>
              </span>
            </label>
          );
        })}
        <label
          htmlFor={`match-${decision.rowIndex}-new`}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 hover:bg-accent/30"
        >
          <RadioGroupItem
            id={`match-${decision.rowIndex}-new`}
            value="new"
            className="mt-0.5"
          />
          <span className="inline-flex items-center gap-1.5 text-sm">
            <UserPlus className="size-3.5" aria-hidden />
            &lsquo;{name}&rsquo; 새 친구로 만들기
          </span>
        </label>
      </RadioGroup>
    </div>
  );
}

function formatAmount(amount: string): string {
  // 숫자만 추출해 콤마 단위로. 비숫자 문자는 그대로 보존 (사용자가 "10만원" 식 입력했을 수도).
  const onlyDigits = amount.replace(/[^\d]/g, "");
  if (onlyDigits.length === 0) return amount;
  const n = Number(onlyDigits);
  if (!Number.isFinite(n)) return amount;
  return `${n.toLocaleString("ko-KR")}원`;
}

/** decision kind 도 export — Step 5 미리보기 계산에서 같은 enum 사용. */
export type { RowDecisionKind };
