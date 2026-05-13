"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  BatchSettings,
  ImportRow,
  NormalizedRow,
  RowDecision,
} from "@/lib/import/types";

/**
 * Step 5 — 미리보기 + 일괄 import 실행 (PRD §3).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 요약 카드: "N명 새 친구 생성 / M개 신세 추가" — 결정 로그 D-016 의 미리보기 톤.
 *   - 본문 = 상위 10건 미리보기 + 더보기 토글 — 200건 전부 미리보기는 정보 과잉.
 *   - 실행 버튼 = variant="default" (강조). 진행 중엔 disabled + 로더.
 *   - 진행률 표시: 본격 진행률은 worker 가 결합 (transaction 일괄이라 binary). UI 골격에서는
 *     pending 동안 indeterminate 스피너 + "잠시만 기다려 주세요" 메시지.
 *   - 성공 후 토스트 — 본 슬라이스에 toast 인프라 없으니 console + redirect 로 단순 처리.
 *     worker 가 toast/sonner 결합 시 통합.
 *
 * 거절된 대안:
 *   - 미리보기 전체 노출 — 200건 스크롤이 검토 의도 흐림.
 *   - 진행률 실시간 (XX/200) — V1 트랜잭션 1회 호출이라 정확한 binary 만 가능. 추정치는 신뢰 X.
 */

export type Step5PreviewProps = {
  normalizedRows: ReadonlyArray<NormalizedRow>;
  decisions: ReadonlyMap<number, RowDecision>;
  settings: BatchSettings;
  /** 매칭 결과에서 friend_id → name 매핑. 미리보기 라벨용. */
  friendNameById: ReadonlyMap<string, string>;
  onBack: () => void;
  /** 실행. worker 결합 시 bulkImportEntries 호출. */
  onConfirm: (rows: ReadonlyArray<ImportRow>) => Promise<void>;
};

const PREVIEW_LIMIT = 10;

export function Step5Preview({
  normalizedRows,
  decisions,
  settings,
  friendNameById,
  onBack,
  onConfirm,
}: Step5PreviewProps) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const { rows, newFriendsCount, matchedCount, skippedCount } = React.useMemo(() => {
    return buildImportRows({ normalizedRows, decisions, settings });
  }, [normalizedRows, decisions, settings]);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      await onConfirm(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "import 실행에 실패했어요.";
      setError(msg);
      setPending(false);
    }
    // 성공 시 부모가 redirect — pending 유지로 더블 클릭 차단.
  }

  const visible = showAll ? rows : rows.slice(0, PREVIEW_LIMIT);
  const hasMore = rows.length > PREVIEW_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        아래 내용으로 일괄 추가돼요. 한 번 더 확인 후 &lsquo;가져오기 실행&rsquo; 을 눌러주세요.
      </p>

      {/* 요약 카드 */}
      <Card size="sm" className="flex-row flex-wrap items-center gap-4 p-4">
        <SummaryStat label="추가될 신세" value={rows.length} accent="primary" />
        <SummaryStat label="새 친구 생성" value={newFriendsCount} accent="lime" />
        <SummaryStat label="기존 친구 매칭" value={matchedCount} accent="default" />
        {skippedCount > 0 ? (
          <SummaryStat label="건너뜀" value={skippedCount} accent="muted" />
        ) : null}
      </Card>

      {/* 메타 미리보기 */}
      <Card size="sm" className="gap-1 p-3 text-xs">
        <p className="text-muted-foreground">공통 설정</p>
        <p>
          <span className="font-medium text-foreground">이벤트:</span>{" "}
          {settings.eventName}
        </p>
        <p>
          <span className="font-medium text-foreground">받은 날짜:</span>{" "}
          {settings.receivedDate}
        </p>
      </Card>

      {/* row 미리보기 */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">
          미리보기 ({visible.length}/{rows.length}건)
        </p>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
          {visible.map((r, idx) => (
            <li key={idx} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2 text-xs">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  r.friendId
                    ? "bg-primary/15 text-primary"
                    : "bg-accent text-accent-foreground",
                )}
              >
                {r.friendId ? "기존" : "신규"}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {r.friendId
                    ? (friendNameById.get(r.friendId) ?? "친구")
                    : (r.newFriendName ?? "친구")}
                </p>
                <p className="truncate text-muted-foreground">{r.memo}</p>
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
              가져올 신세가 없어요. 이전 단계에서 포함 상태를 다시 확인해 보세요.
            </li>
          ) : null}
        </ul>
        {hasMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            className="self-start text-xs"
          >
            {showAll ? "접기" : `${rows.length - PREVIEW_LIMIT}건 더 보기`}
          </Button>
        ) : null}
      </div>

      {/* 에러 */}
      {error ? (
        <Card className="flex-row items-start gap-2 border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </Card>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          이전
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={handleConfirm}
          disabled={pending || rows.length === 0}
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              가져오는 중…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" aria-hidden />
              가져오기 실행 ({rows.length}건)
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// SummaryStat
// ============================================================

type Accent = "primary" | "lime" | "default" | "muted";

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: Accent;
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "lime"
        ? "text-brand-lime"
        : accent === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-heading text-2xl font-semibold", accentClass)}>
        {value}
      </span>
    </div>
  );
}

// ============================================================
// buildImportRows — RowDecision + BatchSettings → ImportRow[]
// ============================================================

function buildImportRows({
  normalizedRows,
  decisions,
  settings,
}: {
  normalizedRows: ReadonlyArray<NormalizedRow>;
  decisions: ReadonlyMap<number, RowDecision>;
  settings: BatchSettings;
}): {
  rows: ImportRow[];
  newFriendsCount: number;
  matchedCount: number;
  skippedCount: number;
} {
  const rows: ImportRow[] = [];
  // 동일 newFriendName 중복 dedup — Step 4 에서 동명이인 분리는 명시 의도이므로
  // 미리보기 단계에서는 동일 이름이 여러 row 면 같은 신규 친구로 보여준다 (실제 insert 도 한 번만).
  const dedupNew = new Set<string>();
  let newFriendsCount = 0;
  let matchedCount = 0;
  let skippedCount = 0;

  for (const row of normalizedRows) {
    const decision = decisions.get(row.rowIndex);
    if (!decision || !decision.included) {
      skippedCount += 1;
      continue;
    }
    const memo = buildMemo({
      eventName: settings.eventName,
      name: row.name,
      amount: row.amount,
      note: row.note,
    });

    if (
      decision.kind === "single-confirmed" ||
      decision.kind === "multiple-pick"
    ) {
      if (!decision.selectedFriendId) {
        // 라디오를 안 골랐는데 multiple-pick kind 인 경우는 없도록 Step 4 가 보장.
        skippedCount += 1;
        continue;
      }
      matchedCount += 1;
      rows.push({
        friendId: decision.selectedFriendId,
        newFriendName: null,
        memo,
        receivedDate: settings.receivedDate,
        categoryId: settings.categoryId,
        repaymentTiming: settings.repaymentTiming,
      });
    } else {
      // new / single-rejected / multiple-new → 신규 친구.
      const key = row.name.toLowerCase().trim();
      if (!dedupNew.has(key)) {
        dedupNew.add(key);
        newFriendsCount += 1;
      }
      rows.push({
        friendId: null,
        newFriendName: row.name,
        memo,
        receivedDate: settings.receivedDate,
        categoryId: settings.categoryId,
        repaymentTiming: settings.repaymentTiming,
      });
    }
  }

  return { rows, newFriendsCount, matchedCount, skippedCount };
}

function buildMemo({
  eventName,
  name,
  amount,
  note,
}: {
  eventName: string;
  name: string;
  amount: string | null;
  note: string | null;
}): string {
  const parts: string[] = [eventName, name];
  if (amount && amount.trim().length > 0) {
    const onlyDigits = amount.replace(/[^\d]/g, "");
    if (onlyDigits.length > 0) {
      const n = Number(onlyDigits);
      if (Number.isFinite(n)) {
        parts.push(`금액 ${n.toLocaleString("ko-KR")}원`);
      } else {
        parts.push(`금액 ${amount}`);
      }
    } else {
      parts.push(`금액 ${amount}`);
    }
  }
  if (note && note.trim().length > 0) parts.push(note.trim());
  return parts.join(" · ");
}
