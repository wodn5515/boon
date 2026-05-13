"use client";

import * as React from "react";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

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
import { cn } from "@/lib/utils";
import type { RawRow } from "@/lib/import/types";

// 결정 로그 011 §B-6 — mock 모듈은 dev 시연용. production 번들에서 dead code elimination 되도록
//   top-level `import` 대신 dynamic `import()` 를 NODE_ENV 가드 안에서만 호출한다.
//   `handleMockClick` 진입 자체가 production 에서는 버튼 미렌더링이라 도달 불가능.

/**
 * Step 1 — 엑셀 파일 업로드 + 시트 선택 (PRD §3).
 *
 * 디자이너 자율 결정 (Lead 위임):
 *   - SheetJS 파싱은 client 측에서 (서버로 raw 파일 보내지 않음 — RSC 부담 ↓, 개인 노트 데이터 minimal expose).
 *   - 다중 시트 → 시트 선택 select 노출. 단일 시트면 자동 선택.
 *   - mock 시연 버튼 — 실제 .xlsx 없이도 흐름 검증. worker 결합 시 제거 가능.
 *   - 드롭존 + 파일 입력 둘 다 — 데스크톱은 드래그&드롭 친화, 모바일은 클릭.
 *   - 파일명·row 수 미리보기 — "올바른 파일을 골랐다" 확인감.
 *
 * 거절된 대안:
 *   - 서버 측 파싱 → 큰 .xlsx (50~200명) 가 RSC 페이로드로 왕복하며 비용↑. 회상 노트 데이터의
 *     서버 노출도 최소가 안전. SheetJS 가 client 에서 매끄럽게 돌아간다는 게 SheetJS 의 본 강점.
 */

export type ParsedExcel = {
  fileName: string;
  /** 시트명 배열. 단일이면 1개. */
  sheetNames: ReadonlyArray<string>;
  /** 선택된 시트의 헤더(row 0). */
  headers: ReadonlyArray<string>;
  /** 선택된 시트의 데이터 row 들 (header 제외, key = 헤더 텍스트). */
  rows: ReadonlyArray<RawRow>;
};

export type Step1UploadProps = {
  /** 파싱·시트 선택까지 끝난 결과 — 다음 단계로 넘기는 콜백. */
  onParsed: (parsed: ParsedExcel) => void;
};

// 결정 로그 011 §B-4 — XLSX.read 진입 전 file size 가드.
//   사용자가 수십~수백 MB 짜리 .xlsx 를 떨구면 client 메모리 폭주 / 브라우저 freeze.
//   회상 노트 톤상 친구가 50~200명 단위라 10MB 면 충분히 여유 (.xlsx 압축률 고려).
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function Step1Upload({ onParsed }: Step1UploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  // 다중 시트 분기 — 단일 파일을 읽고 시트 N개면 사용자 선택을 기다린다.
  const [workbook, setWorkbook] = React.useState<{
    fileName: string;
    workbook: XLSX.WorkBook;
  } | null>(null);
  const [selectedSheet, setSelectedSheet] = React.useState<string>("");

  async function handleFile(file: File) {
    setError(null);
    // 결정 로그 011 §B-4 — XLSX.read 진입 전 10MB 가드. SheetJS 가 메모리에서 압축 해제하면
    //   같은 byte 수의 수배까지 RAM 으로 부풀어오를 수 있어 사전 차단.
    if (file.size > MAX_FILE_BYTES) {
      setError(
        "파일이 너무 커요. 10MB 이하의 .xlsx · .xls 만 가져올 수 있어요. 시트를 나눠 다시 시도해 주세요.",
      );
      return;
    }
    setPending(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (wb.SheetNames.length === 0) {
        setError("엑셀 파일에서 시트를 찾지 못했어요.");
        return;
      }
      if (wb.SheetNames.length === 1) {
        // 단일 시트 — 바로 파싱해 넘긴다.
        const parsed = readSheet(file.name, wb, wb.SheetNames[0]);
        if (!parsed) return;
        onParsed(parsed);
        return;
      }
      // 다중 시트 — 사용자 선택 노출.
      setWorkbook({ fileName: file.name, workbook: wb });
      setSelectedSheet(wb.SheetNames[0]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "파일을 읽지 못했어요.";
      setError(`엑셀 파싱 실패: ${msg}`);
    } finally {
      setPending(false);
    }
  }

  function readSheet(
    fileName: string,
    wb: XLSX.WorkBook,
    sheetName: string,
  ): ParsedExcel | null {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      setError(`시트 '${sheetName}' 를 읽지 못했어요.`);
      return null;
    }
    // header:1 → 첫 row 를 헤더로 활용. defval 로 빈 셀을 "" 로 평탄화.
    const rows2d = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (rows2d.length === 0) {
      setError("선택한 시트에 데이터가 없어요.");
      return null;
    }
    const headers = (rows2d[0] as unknown[]).map((cell) => String(cell ?? "").trim());
    const dataRows: RawRow[] = [];
    for (let i = 1; i < rows2d.length; i++) {
      const arr = rows2d[i] as unknown[];
      const obj: Record<string, string> = {};
      let nonEmpty = false;
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        if (!key) continue;
        const value = String(arr[j] ?? "").trim();
        if (value.length > 0) nonEmpty = true;
        obj[key] = value;
      }
      if (nonEmpty) dataRows.push(obj);
    }
    if (dataRows.length === 0) {
      setError("선택한 시트에 비어 있지 않은 데이터 행이 없어요.");
      return null;
    }
    return {
      fileName,
      sheetNames: wb.SheetNames,
      headers,
      rows: dataRows,
    };
  }

  function handleConfirmSheet() {
    if (!workbook || !selectedSheet) return;
    const parsed = readSheet(workbook.fileName, workbook.workbook, selectedSheet);
    if (!parsed) return;
    onParsed(parsed);
  }

  async function handleMockClick() {
    // 디자이너 라운드 시연용 — 실제 .xlsx 없이도 흐름 검증.
    // 결정 로그 011 §B-6 + sfx 라운드 011 🟡 S2 — production NODE_ENV 가드를 함수 본문에도
    //   배치해 webpack 이 dynamic import 자체를 dead code 로 인지하도록 한다. 버튼 렌더만
    //   가드하면 호출 가능 함수로 보고 청크 artifact 가 빌드 산출물에 잔존할 수 있다.
    if (process.env.NODE_ENV === "production") return;
    const { MOCK_EXCEL_HEADERS, MOCK_EXCEL_ROWS } = await import("@/lib/import/mock");
    onParsed({
      fileName: "예시 — 결혼식 축의금.xlsx",
      sheetNames: ["축의금"],
      headers: [...MOCK_EXCEL_HEADERS],
      rows: MOCK_EXCEL_ROWS.map((r) => ({ ...r })),
    });
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 드롭존 — 클릭 시 input 호출 */}
      <Card>
        <div
          role="button"
          tabIndex={0}
          aria-label="엑셀 파일 업로드 영역"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
            "cursor-pointer hover:border-primary/60 hover:bg-accent/20",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            dragOver && "border-primary bg-accent/30",
            pending && "pointer-events-none opacity-60",
          )}
        >
          <span
            aria-hidden
            className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <Upload className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-heading text-base font-medium text-foreground">
              엑셀 파일을 끌어다 놓거나 클릭하세요
            </p>
            <p className="text-xs text-muted-foreground">
              .xlsx · .xls 형식 지원 · 첫 행은 컬럼 제목(이름·금액 등)이어야 해요
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              // 같은 파일 다시 선택할 수 있게 value 비우기.
              e.currentTarget.value = "";
            }}
          />
        </div>
      </Card>

      {/* 다중 시트 분기 */}
      {workbook ? (
        <Card className="gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileSpreadsheet className="size-4" />
            <span className="truncate">{workbook.fileName}</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="import-sheet">시트 선택</Label>
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger id="import-sheet" className="w-full">
                <SelectValue placeholder="시트를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {workbook.workbook.SheetNames.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleConfirmSheet} disabled={!selectedSheet}>
              이 시트 사용하기
            </Button>
          </div>
        </Card>
      ) : null}

      {/* 에러 */}
      {error ? (
        <Card className="flex flex-row items-start gap-2 border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </Card>
      ) : null}

      {/* 디자이너 라운드 mock 시연 버튼 — dev 빌드에서만 노출.
          production 에서는 호기심에 mock 데이터로 진행 → 가짜 친구가 본인 친구 목록에 추가되는
          경로를 차단해야 한다 (PR #8 #3 청산). worker 결합 후에도 시연 가치는 남아 있어
          완전 제거가 아니라 환경 가드로 좁힌다. */}
      {process.env.NODE_ENV !== "production" ? (
        <div className="flex items-center justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleMockClick()}
            className="text-xs text-muted-foreground"
          >
            예시 파일로 흐름 살펴보기
          </Button>
        </div>
      ) : null}
    </div>
  );
}
