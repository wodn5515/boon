/**
 * 엑셀 import — 친구 이름 매칭 placeholder + 일괄 insert placeholder.
 *
 * **본 슬라이스(009 / 디자이너 라운드)는 시그니처만 정의한다.** worker 가 트랜잭션 본체를 채운다.
 *
 * 시그니처 (PRD §3, D-016, D-026 + 디자이너 자율 판단):
 *  - `matchFriendsByName(names: string[])` : 본인 친구들에서 이름별 매칭 결과 (0/1/N 건) 반환.
 *    - 매칭 기준 = 정확 일치 (case-insensitive trim). 부분 일치는 V1 제외 (false-positive 방지).
 *    - 후보마다 친구 메모(note) + 최근 신세 1건 (memo, received_date) 동봉 (D-026).
 *    - SQL: friends WHERE LOWER(name) IN (...) AND is_deleted=false AND user_id=$1
 *           + LEFT JOIN LATERAL (SELECT … FROM entries WHERE friend_id = friends.id ORDER BY received_date DESC LIMIT 1).
 *
 *  - `bulkImportEntries(rows: ImportRow[])` : 한 트랜잭션 안에서 새 친구 + entries 일괄 insert.
 *    - 새 친구는 한 row 마다 friends.insert.returning({id}) 후 entry 에 그 id 사용.
 *    - 동일 newFriendName 이 여러 row 에 반복돼도 각각 별개의 친구로 생성하지 않고 첫 row 에서
 *      만든 id 를 재사용 (worker 결합 시 dedup 맵 사용 — 결혼식 시나리오의 동명이인 명시 의도 분리는
 *      Step 4 검토 단계에서 이미 했다고 가정).
 *    - 단일 트랜잭션 — 어느 row 라도 실패하면 전체 롤백.
 *
 * 본 파일은 import 'use server' 디렉티브 없음 — worker 가 actions.ts 로 옮기거나
 * 그대로 server-only 함수로 호출. UI 골격은 mock 으로 흐름만 시연.
 */
import type {
  BulkImportResult,
  ImportRow,
  MatchResult,
} from "@/lib/import/types";

/**
 * 본인 친구 목록에서 주어진 이름들 각각에 대해 매칭 후보를 반환한다.
 *
 * worker 결합 시 명시할 동작:
 *   - 빈 names 배열 → 빈 배열 반환 (트리거 없음).
 *   - names 안의 중복 처리: 호출 측에서 dedup 하는 게 자연. 본 함수는 받은 순서 보존.
 *   - 매칭 안 된 이름도 `candidates: []` 로 반환 (Step 4 가 "0건 = 새 친구" 로 분기).
 *
 * **본 슬라이스는 placeholder.** worker 가 drizzle + LEFT JOIN LATERAL 로 본격 결합.
 */
export async function matchFriendsByName(
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<MatchResult>> {
  // worker 가 본격 구현. 디자이너 UI 골격에서는 호출 안 함 (페이지 컴포넌트 내부에서 mock 사용).
  void names;
  throw new Error(
    "matchFriendsByName 은 아직 구현되지 않았어요 — worker 결합 예정 (009 import 슬라이스).",
  );
}

/**
 * 일괄 import 실행 — 새 친구 + entries 를 한 트랜잭션으로.
 *
 * worker 결합 시 명시할 동작:
 *   - user_id 는 getCurrentUser() 로 서버 측 자동 주입 (createEntry 와 동일 패턴).
 *   - rows 중 newFriendName 이 채워진 것을 먼저 dedup 후 friends.insert.returning,
 *     id 매핑을 만든 뒤 entries 일괄 insert.
 *   - 카테고리 본인 소유 cross-check (한 번만 — 모든 row 가 같은 categoryId 라).
 *   - revalidate "/", "/entries", "/friends".
 *
 * **본 슬라이스는 placeholder.** worker 가 actions.ts 로 옮기고 'use server' 추가 + 본격 결합.
 */
export async function bulkImportEntries(
  rows: ReadonlyArray<ImportRow>,
): Promise<BulkImportResult> {
  void rows;
  throw new Error(
    "bulkImportEntries 는 아직 구현되지 않았어요 — worker 결합 예정 (009 import 슬라이스).",
  );
}
