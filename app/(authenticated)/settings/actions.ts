"use server";

/**
 * /settings Server Action 시그니처 (placeholder).
 *
 * 본 슬라이스(디자이너)는 UI 골격만 다루며, 실제 본체는 worker 가 결정 로그 004 §B 패턴으로
 * 결합한다:
 *   - `getCurrentUser()` 로 user_id 서버 측 자동 주입 (클라이언트 위조 방지)
 *   - drizzle 쿼리는 categories 슬라이스의 schema/migration 도입 후 결합
 *   - 성공 시 `revalidatePath('/settings')`
 *
 * 시그니처를 미리 export 해두면 client 컴포넌트(CategoryFormDialog 등)가
 * import 경로를 잡을 수 있고, worker 가 구현 본체만 채워 넣으면 된다.
 */

/**
 * 카테고리 추가.
 *
 * formData fields:
 *   - name (string, required)
 *   - icon (string | "" , optional)
 *   - color (string hex, required — UI 가 항상 설정)
 *
 * worker TODO:
 *   - user_id 자동 주입
 *   - 사용자 카테고리 sort_order = MAX(sort_order) + 1
 *   - is_system = false 강제
 *   - 사용자 카테고리 수 상한 정책 (D-009 보강 필요 — 디자이너 보고 §"Lead 판단 위임" 참고)
 */
export async function createCategory(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<void> {
  throw new Error(
    "createCategory: 아직 결합되지 않았어요. worker 가 categories 슬라이스에서 구현합니다.",
  );
}

/**
 * 카테고리 수정.
 *
 * formData fields:
 *   - id (string, required)
 *   - name (string, required)
 *   - icon (string | "", optional) — is_system=true 면 서버에서 무시
 *   - color (string hex) — is_system=true 면 서버에서 무시
 *
 * worker TODO:
 *   - is_system=true 면 name 만 update 하고 icon/color 는 기존 값 유지
 *   - RLS + application-layer 이중 방어 (user_id 일치 확인)
 */
export async function updateCategory(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<void> {
  throw new Error(
    "updateCategory: 아직 결합되지 않았어요. worker 가 categories 슬라이스에서 구현합니다.",
  );
}

/**
 * 카테고리 삭제 (D-018).
 *
 * - is_system=true 면 throw (UI 가 trigger 자체를 막지만 방어 코딩)
 * - migrateTo 가 주어지면: 해당 카테고리에 묶인 entries 를 migrateTo 로 이전 후 삭제
 * - migrateTo 가 null 이면: 묶인 entries 가 0개인 경우에만 hard delete
 *
 * worker TODO:
 *   - entries 슬라이스 도입 후 카운트 집계 + 이전 트랜잭션
 *   - V1 골격에선 entryCount 가 항상 0 placeholder 라 migrateTo = null 만 호출됨
 */
export async function deleteCategory(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _args: {
    id: string;
    migrateTo: string | null;
  },
): Promise<void> {
  throw new Error(
    "deleteCategory: 아직 결합되지 않았어요. worker 가 categories 슬라이스에서 구현합니다.",
  );
}

/**
 * 로그아웃 Server Action (PRD §5).
 *
 * worker TODO (결정 로그 003 §A 패턴):
 *   - `const supabase = await createClient();`
 *   - `await supabase.auth.signOut();`
 *   - `redirect('/login');`
 *
 * E2E 우회 모드(`E2E_AUTH_BYPASS`)에서는 fake 쿠키 제거 + redirect 만 수행.
 */
export async function signOut(): Promise<void> {
  throw new Error(
    "signOut: 아직 결합되지 않았어요. worker 가 categories 슬라이스에서 구현합니다.",
  );
}
