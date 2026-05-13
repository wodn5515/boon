"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import {
  ImportStepper,
  IMPORT_STEPS,
} from "@/components/import/import-stepper";
import { Step1Upload, type ParsedExcel } from "@/components/import/step-1-upload";
import { Step2ColumnMapping } from "@/components/import/step-2-column-mapping";
import { Step3EventSettings } from "@/components/import/step-3-event-settings";
import { Step4MatchingReview } from "@/components/import/step-4-matching-review";
import { Step5Preview } from "@/components/import/step-5-preview";
import type {
  BatchSettings,
  ColumnMapping,
  ImportRow,
  MatchResult,
  NormalizedRow,
  RowDecision,
} from "@/lib/import/types";

// 결정 로그 011 §B-6 — mock 모듈은 dev 시연용. production 번들에서 dead code elimination 되도록
//   top-level `import` 대신 dynamic `import()` 를 NODE_ENV 가드 안에서만 호출한다.
//   - matchAction 미지정 분기에서만 mock 매칭표가 필요 (디자이너 라운드 시연 한정).
//   - production 에서는 matchAction 이 반드시 주입되어 mock 경로 자체가 도달 불가능.
//   - sfx 라운드 PR #9 🟡 #1 청산.

/**
 * ImportWizard — 5단계 엑셀 import 워크플로우의 client 컨테이너 (PRD §3, D-016).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - **페이지 (`/entries/import`) + 단일 컴포넌트의 conditional 렌더** — 모달 X.
 *     · 50~200 row 검토는 모달이 비좁고, 페이지가 자연스럽다.
 *     · 단계 사이 전환은 `step` 상태 하나로 — URL 동기화는 V1 생략 (뒤로가기 시 페이지 새로고침으로
 *       초기화되는 게 오히려 자연스럽다고 판단; 결혼식 200건 임시 입력 중 ESC/뒤로가기로 인한
 *       의도치 않은 상태 복원이 더 혼란).
 *   - 매칭 데이터 — 본 슬라이스(009 디자이너)는 mock 사용. worker 결합 시 server action 결과 주입.
 *   - 실행 후 redirect — toast 인프라 없음 → URL 쿼리 (`?imported=N`) 로 entries 페이지에서 인지.
 *
 * worker 결합 지점:
 *   - `matchFriendsByName(names)` — Step 3 → Step 4 진입 시 server action 으로 교체.
 *   - `bulkImportEntries(rows)`  — Step 5 confirm 시 server action 으로 교체.
 */

export type ImportWizardProps = {
  categoryOptions: ReadonlyArray<{
    id: string;
    name: string;
    icon: string | null;
    color: string;
  }>;
  /**
   * worker 가 결합할 매칭 server action. 미지정 시 mock 사용 (디자이너 라운드 시연용).
   *
   * 시그니처는 lib/import/queries.ts `matchFriendsByName` 와 동일.
   */
  matchAction?: (names: ReadonlyArray<string>) => Promise<ReadonlyArray<MatchResult>>;
  /**
   * worker 가 결합할 일괄 import server action. 미지정 시 mock 처리 (콘솔에 출력 후 redirect).
   */
  bulkImportAction?: (rows: ReadonlyArray<ImportRow>) => Promise<{
    entriesCreated: number;
    friendsCreated: number;
  }>;
};

type StepIndex = 0 | 1 | 2 | 3 | 4;

export function ImportWizard({
  categoryOptions,
  matchAction,
  bulkImportAction,
}: ImportWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<StepIndex>(0);

  // 단계별 누적 상태.
  const [parsed, setParsed] = React.useState<ParsedExcel | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [settings, setSettings] = React.useState<BatchSettings | null>(null);
  const [matchResults, setMatchResults] = React.useState<ReadonlyArray<MatchResult> | null>(null);
  const [decisions, setDecisions] = React.useState<ReadonlyMap<number, RowDecision> | null>(null);

  // matching 진행 중 상태 (Step 3 → Step 4 전환 시).
  const [matchPending, setMatchPending] = React.useState(false);
  const [matchError, setMatchError] = React.useState<string | null>(null);

  // Step 1 → 2
  function handleParsed(p: ParsedExcel) {
    setParsed(p);
    setMapping(null); // 새 파일 → 매핑 초기화 (자동 감지 재실행).
    setStep(1);
  }

  // Step 2 → 3
  function handleMappingDone(m: ColumnMapping) {
    setMapping(m);
    setStep(2);
  }

  // Step 3 → 4 (매칭 server action / mock 호출)
  async function handleSettingsDone(s: BatchSettings) {
    setSettings(s);
    if (!parsed || !mapping || !mapping.name) return;
    const nameCol = mapping.name;
    // (name, parsed.rows index) 페어 수집 — server action 은 names 만 받으므로
    // 결과 rowIndex(= names 인덱스)를 parsed.rows 인덱스로 remap 해야 한다.
    // mock 분기는 parsed.rows index 를 직접 채워 같은 결과를 만든다.
    const indexedNames: Array<{ name: string; rowIndex: number }> = [];
    parsed.rows.forEach((r, idx) => {
      const n = (r[nameCol] ?? "").trim();
      if (n.length > 0) indexedNames.push({ name: n, rowIndex: idx });
    });
    const names = indexedNames.map((x) => x.name);

    setMatchPending(true);
    setMatchError(null);
    try {
      let results: ReadonlyArray<MatchResult>;
      if (matchAction) {
        const raw = await matchAction(names);
        // raw[i].rowIndex 는 names 배열 인덱스라 parsed.rows 인덱스로 remap.
        results = raw.map((r, i) => ({
          ...r,
          rowIndex: indexedNames[i]?.rowIndex ?? r.rowIndex,
        }));
      } else if (process.env.NODE_ENV !== "production") {
        // mock 분기 — UI 골격 시연. 실제 rowIndex 와 매핑 동기화.
        // 결정 로그 011 §B-6 — dynamic import 로 production 번들에서 dead code elimination.
        const { MOCK_MATCH_RESULTS } = await import("@/lib/import/mock");
        results = buildMockMatchResults(parsed, mapping, MOCK_MATCH_RESULTS);
      } else {
        // production 에서는 matchAction 이 반드시 주입돼야 한다 — fallback X.
        throw new Error("친구 매칭 호출이 설정되지 않았어요.");
      }
      setMatchResults(results);
      setDecisions(null); // 새 매칭 → 결정 초기화.
      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "친구 매칭 중 오류가 발생했어요.";
      setMatchError(msg);
    } finally {
      setMatchPending(false);
    }
  }

  // Step 4 → 5
  function handleDecisionsDone(d: ReadonlyMap<number, RowDecision>) {
    setDecisions(d);
    setStep(4);
  }

  // Step 5 confirm
  async function handleConfirm(rows: ReadonlyArray<ImportRow>) {
    if (rows.length === 0) {
      throw new Error("가져올 신세가 없어요.");
    }
    if (bulkImportAction) {
      const result = await bulkImportAction(rows);
      router.push(`/entries?imported=${result.entriesCreated}`);
      router.refresh();
    } else {
      // mock 분기 — 콘솔 출력 후 entries 페이지로 이동.
      console.info("[ImportWizard mock] bulkImportEntries 호출:", rows);
      router.push(`/entries?imported=${rows.length}&mock=1`);
      router.refresh();
    }
  }

  // 정규화된 row 들 — Step 4/5 가 공유.
  const normalizedRows = React.useMemo<ReadonlyArray<NormalizedRow>>(() => {
    if (!parsed || !mapping || !mapping.name) return [];
    const nameCol = mapping.name;
    const amountCol = mapping.amount;
    const noteCol = mapping.note;
    const result: NormalizedRow[] = [];
    parsed.rows.forEach((r, idx) => {
      const name = (r[nameCol] ?? "").trim();
      if (!name) return;
      result.push({
        rowIndex: idx,
        name,
        amount: amountCol ? (r[amountCol] ?? "").trim() || null : null,
        note: noteCol ? (r[noteCol] ?? "").trim() || null : null,
      });
    });
    return result;
  }, [parsed, mapping]);

  // friend_id → name 맵 (Step 5 미리보기용).
  const friendNameById = React.useMemo<ReadonlyMap<string, string>>(() => {
    const m = new Map<string, string>();
    if (matchResults) {
      for (const r of matchResults) {
        for (const c of r.candidates) {
          m.set(c.friend_id, c.friend_name);
        }
      }
    }
    return m;
  }, [matchResults]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper */}
      <ImportStepper
        current={step}
        onStepClick={(i) => {
          // 이전 단계로만 이동 허용 — 미래 단계는 데이터가 필요.
          if (i < step) setStep(i as StepIndex);
        }}
      />

      <Card className="p-4 sm:p-6">
        <div className="mb-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {IMPORT_STEPS[step].label}
          </h2>
        </div>

        {step === 0 && <Step1Upload onParsed={handleParsed} />}

        {step === 1 && parsed && (
          <Step2ColumnMapping
            headers={parsed.headers}
            rows={parsed.rows}
            initialMapping={mapping ?? undefined}
            onBack={() => setStep(0)}
            onNext={handleMappingDone}
          />
        )}

        {step === 2 && parsed && mapping && (
          <>
            <Step3EventSettings
              categoryOptions={categoryOptions}
              initial={settings ?? undefined}
              onBack={() => setStep(1)}
              onNext={handleSettingsDone}
            />
            {matchPending ? (
              <p className="mt-3 text-xs text-muted-foreground">
                친구 목록과 이름을 매칭하는 중…
              </p>
            ) : null}
            {matchError ? (
              <p
                role="alert"
                className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                {matchError}
              </p>
            ) : null}
          </>
        )}

        {step === 3 && matchResults && (
          <Step4MatchingReview
            normalizedRows={normalizedRows}
            matchResults={matchResults}
            initialDecisions={decisions ?? undefined}
            onBack={() => setStep(2)}
            onNext={handleDecisionsDone}
          />
        )}

        {step === 4 && decisions && settings && (
          <Step5Preview
            normalizedRows={normalizedRows}
            decisions={decisions}
            settings={settings}
            friendNameById={friendNameById}
            onBack={() => setStep(3)}
            onConfirm={handleConfirm}
          />
        )}
      </Card>
    </div>
  );
}

// ============================================================
// mock 매칭 결과 빌더 — MOCK_MATCH_RESULTS 의 이름 표를 정규화된 row 에 매핑.
// 실제 파일을 업로드한 경우에도 디자이너 시연이 가능하도록 이름 일치만 검사.
// 결정 로그 011 §B-6 — 호출자가 dynamic import 한 mock 테이블을 인자로 넘긴다.
// ============================================================
function buildMockMatchResults(
  parsed: ParsedExcel,
  mapping: ColumnMapping,
  mockResults: ReadonlyArray<MatchResult>,
): ReadonlyArray<MatchResult> {
  if (!mapping.name) return [];
  const nameCol = mapping.name;
  // mock 테이블에서 이름 → 후보들.
  const mockByName = new Map<string, MatchResult["candidates"]>();
  for (const r of mockResults) {
    mockByName.set(r.name, r.candidates);
  }
  const result: MatchResult[] = [];
  parsed.rows.forEach((row, idx) => {
    const name = (row[nameCol] ?? "").trim();
    if (!name) return;
    const candidates = mockByName.get(name) ?? [];
    result.push({ rowIndex: idx, name, candidates });
  });
  return result;
}
