"use server";

import {
  bulkImportEntries,
  matchFriendsByName,
} from "@/lib/import/queries";
import type {
  BulkImportResult,
  ImportRow,
  MatchResult,
} from "@/lib/import/types";

/**
 * `/entries/import` Server Action 결합 (결정 로그 009 §J·§K + §M-1).
 *
 * ImportWizard(client component)는 이 두 액션을 props 로 받아 mock 분기 대신 실 DB 흐름을 탄다:
 *   - matchAction: Step 3 → Step 4 진입 시 친구 매칭 결과 조회 (LEFT JOIN LATERAL).
 *   - bulkImportAction: Step 5 실행 시 단일 트랜잭션 bulk insert + revalidate.
 *
 * lib/import/queries.ts 가 본 두 함수의 본격 SQL/트랜잭션을 책임지고, 본 파일은 'use server'
 * 디렉티브를 붙여 RSC → client 경계를 통과시키는 얇은 래퍼.
 */

export async function matchAction(
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<MatchResult>> {
  return matchFriendsByName(names);
}

export async function bulkImportAction(
  rows: ReadonlyArray<ImportRow>,
): Promise<BulkImportResult> {
  return bulkImportEntries(rows);
}
