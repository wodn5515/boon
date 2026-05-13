import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Step 1 파일 업로드 — 10MB size 가드 회귀 잠금 (011 §B-4).
 *
 * 회귀 시드 (PR #8 🟢 #4):
 *   - `components/import/step-1-upload.tsx::handleFile` 가 file.size 검사 없이 `XLSX.read(buf, ...)`
 *     를 직행 호출한다. 사용자가 무거운 .xlsx (수십~수백 MB) 를 떨구면 client 메모리 폭주 / 브라우저
 *     freeze.
 *
 * 본 spec 은 다음을 잠근다:
 *   1. 10MB(=10 * 1024 * 1024 byte) 초과 파일이 들어오면 사용자 친화 메시지가 노출된다.
 *   2. `XLSX.read` 가 호출되지 않는다 (가드가 SheetJS 진입 전에 차단).
 *   3. `onParsed` 콜백이 호출되지 않는다 (다음 단계로 진행 X).
 *
 * worker 청산 후 기대:
 *   - handleFile 진입부에서 `if (file.size > MAX_FILE_BYTES) { setError("... 10MB ..."); return; }`
 *     가드 추가. MAX_FILE_BYTES = 10 * 1024 * 1024.
 *
 * 빨강 시드:
 *   - 현재는 가드 없음 → 10MB 초과 파일도 그대로 XLSX.read 호출 → 본 spec 의 "친화 메시지" assert
 *     와 "XLSX.read 호출 X" assert 모두 빨갛게 떨어진다.
 */

// XLSX.read mock — 호출되었는지를 카운트한다. 실제 파싱 결과는 빈 SheetNames 로.
vi.mock("xlsx", () => {
  const read = vi.fn(() => ({ SheetNames: [], Sheets: {} }));
  const utils = {
    sheet_to_json: vi.fn(() => []),
  };
  return { read, utils, default: { read, utils } };
});

import * as XLSX from "xlsx";
import { Step1Upload } from "@/components/import/step-1-upload";

function makeFile(name: string, sizeBytes: number, type: string): File {
  // jsdom 의 File 은 직접 size 를 set 할 수 없어 Blob 의 size 가 매김.
  // 큰 ArrayBuffer 를 만들지 않고 size 만 부풀린 fake 파일을 만들고 싶다 →
  // File 생성 후 Object.defineProperty 로 size 를 덮어쓴다.
  const blob = new Blob(["x"], { type });
  const file = new File([blob], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes, configurable: true });
  // arrayBuffer 도 가짜로 — handleFile 이 어차피 size 가드에 막혀 호출 안 되어야 함.
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new ArrayBuffer(0)),
    configurable: true,
  });
  return file;
}

describe("[B-4] Step1Upload — 10MB file size 가드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10MB 초과 파일이 들어오면 사용자 친화 메시지가 노출되고 XLSX.read 가 호출되지 않는다", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    const { container } = render(<Step1Upload onParsed={onParsed} />);

    // sr-only file input — accept=".xlsx,.xls".
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    // 10MB + 1 byte 파일. user-event 의 upload 가 jsdom 에서 file input 의 files 를 안전하게 채운다.
    const oversizedFile = makeFile(
      "huge.xlsx",
      10 * 1024 * 1024 + 1,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await user.upload(input!, oversizedFile);

    // 친화 메시지: "10MB" 와 "초과" / "크" 같은 키워드 — worker 가 어떤 카피로 적든
    // "10MB" 숫자는 노출해야 한다 (사용자가 한계를 알 수 있도록).
    await waitFor(() => {
      expect(screen.getByText(/10\s?MB/i)).toBeInTheDocument();
    });

    // XLSX.read 가 호출되지 않았다 — size 가드가 SheetJS 진입 전에 차단.
    expect(XLSX.read).not.toHaveBeenCalled();
    // onParsed 도 호출 안 됨 — 다음 단계 진행 X.
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("10MB 이하 파일은 가드를 통과해 XLSX.read 가 호출된다 (회귀: 가드가 정상 파일을 차단하지 않음)", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    const { container } = render(<Step1Upload onParsed={onParsed} />);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    // 1MB 파일 — 한계 한참 아래.
    const okFile = makeFile(
      "ok.xlsx",
      1 * 1024 * 1024,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await user.upload(input!, okFile);

    await waitFor(() => {
      expect(XLSX.read).toHaveBeenCalled();
    });
  });
});
