"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectColumnMapping } from "@/lib/import/column-detect";
import type { ColumnMapping, RawRow } from "@/lib/import/types";
import { cn } from "@/lib/utils";

/**
 * Step 2 — 컬럼 매핑 (PRD §3).
 *
 * 사용자가 엑셀 헤더(=시트 1행) 를 본 도메인의 "이름·금액·비고" 슬롯에 매핑한다.
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - 자동 감지(`detectColumnMapping`) 결과를 초기값으로 미리 채우고, 사용자가 변경 가능하게 둔다.
 *   - "이름" 슬롯은 필수 — 미선택 시 다음 단계 버튼 disabled + 인라인 경고.
 *   - "매핑 안 함" 옵션 (value="") 을 모든 슬롯에 노출 — 사용자가 잘못 감지된 비고/금액을 빠르게 해제.
 *   - 컬럼 옆에 미리보기 (첫 3개 row 의 해당 컬럼 값) — 매핑 결정 친화.
 *
 * 거절된 대안:
 *   - 컬럼 자동 매핑 100% 자동 — 사용자가 다른 단어 ("선물액", "친분") 를 쓰면 막힘. 시각 확인 ↑ 필요.
 *   - drag&drop 매핑 UI — V1 단순성. select 가 충분히 직관적.
 */

const UNMAPPED = "__unmapped__";

export type Step2ColumnMappingProps = {
  headers: ReadonlyArray<string>;
  /** 시트의 데이터 row — 첫 3개를 매핑 가이드 미리보기로 사용. */
  rows: ReadonlyArray<RawRow>;
  /** 초기값. 없으면 detectColumnMapping 으로 자동 추측. */
  initialMapping?: ColumnMapping;
  onBack: () => void;
  onNext: (mapping: ColumnMapping) => void;
};

export function Step2ColumnMapping({
  headers,
  rows,
  initialMapping,
  onBack,
  onNext,
}: Step2ColumnMappingProps) {
  const [mapping, setMapping] = React.useState<ColumnMapping>(
    () => initialMapping ?? detectColumnMapping(headers),
  );

  const preview = rows.slice(0, 3);

  function update(slot: keyof ColumnMapping, value: string) {
    const next = value === UNMAPPED ? null : value;
    setMapping((prev) => ({ ...prev, [slot]: next }));
  }

  const nameMissing = !mapping.name;
  const autoDetected = React.useMemo(
    () => detectColumnMapping(headers),
    [headers],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        엑셀의 어떤 컬럼이 친구 이름·금액·비고인지 알려주세요. 이름 컬럼은 꼭 필요해요.
      </p>

      <div className="grid gap-3">
        <ColumnSlot
          label="이름"
          required
          headers={headers}
          preview={preview}
          value={mapping.name}
          autoDetected={autoDetected.name}
          onChange={(v) => update("name", v)}
        />
        <ColumnSlot
          label="금액"
          headers={headers}
          preview={preview}
          value={mapping.amount}
          autoDetected={autoDetected.amount}
          onChange={(v) => update("amount", v)}
        />
        <ColumnSlot
          label="비고·메모"
          headers={headers}
          preview={preview}
          value={mapping.note}
          autoDetected={autoDetected.note}
          onChange={(v) => update("note", v)}
        />
      </div>

      {nameMissing ? (
        <p
          role="alert"
          className="inline-flex items-center gap-1.5 text-xs text-destructive"
        >
          <AlertCircle className="size-3.5" aria-hidden />
          이름 컬럼을 선택해 주세요.
        </p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={nameMissing}
          onClick={() => onNext(mapping)}
        >
          다음 — 일괄 설정
        </Button>
      </div>
    </div>
  );
}

type ColumnSlotProps = {
  label: string;
  required?: boolean;
  headers: ReadonlyArray<string>;
  preview: ReadonlyArray<RawRow>;
  value: string | null;
  autoDetected: string | null;
  onChange: (value: string) => void;
};

function ColumnSlot({
  label,
  required,
  headers,
  preview,
  value,
  autoDetected,
  onChange,
}: ColumnSlotProps) {
  const isAuto = value !== null && value === autoDetected;
  const previewValues = value
    ? preview.map((r) => r[value] ?? "").filter((v) => v.length > 0)
    : [];

  return (
    <Card size="sm" className="gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">
          {label}
          {required ? <span className="text-destructive">*</span> : null}
        </Label>
        {isAuto ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-2 py-0.5 text-[10px] text-accent-foreground"
            aria-label="자동 감지된 컬럼"
          >
            <CheckCircle2 className="size-3" aria-hidden />
            자동 감지
          </span>
        ) : null}
      </div>
      <Select
        value={value ?? UNMAPPED}
        onValueChange={onChange}
      >
        <SelectTrigger className="w-full" aria-label={`${label} 컬럼`}>
          <SelectValue placeholder="컬럼 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNMAPPED}>매핑 안 함</SelectItem>
          {headers.filter((h) => h.length > 0).map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {previewValues.length > 0 ? (
        <p
          className={cn(
            "truncate text-xs text-muted-foreground",
            previewValues.length === 0 && "italic",
          )}
        >
          예시: {previewValues.slice(0, 3).join(" · ")}
        </p>
      ) : null}
    </Card>
  );
}
