# 005-categories-crud-and-pr3-cleanup: 카테고리 CRUD + PR #3 잔여 청산

> 작성: 2026-05-12  /  작성자: Lead 에이전트
> 관련 작업: feature/categories-crud

## 배경

PRD §3 카테고리 관리 + §5 `/settings` 페이지 본격 진입. 동시에 PR #3 사용자 종합 리뷰가 entries 슬라이스로 인계한 10건 중 8건을 본 슬라이스에서 청산 (entries 슬라이스 부담 줄이기 + 정정-1 패턴이 categories에 즉시 필요).

004 §"사용자 PR #3 종합 리뷰 응대" 10건 중 본 슬라이스에 흡수:
1. `getCurrentUser react.cache()` (🟡 #1)
2. RLS 단독 회귀 spec (🟡 #2 + sfx 🟢 #13)
3. `setAuthContext` async + `resetAuthContext` + `asServiceRole` (sfx 🟡 #6, #7)
4. sino-Korean 우회 원복 + spec `exact: true` (🟢 #3)
5. Windows path `fileURLToPath` 통일 (🟢 #4)
6. `safeRevalidate` production warn (🟢 #5)
7. `PostgresError` type (🟢 #6)
8. 정정-1 패턴 categories 동일 적용 (10번 항목 — 본 슬라이스 본질)

entries 슬라이스로 deferred 잔여 (2건):
- 9. `e2e-store` entries 도메인 확장 — entries 본 구현 슬라이스에 자연 흡수
- 10. PR #3 §K 다른 deferred (CI 빌드 모드 분기, next lint flat config 등)는 V1 마무리 직전 별도 `/meta` 슬라이스 또는 entries 후속

## 결정

### A. categories 테이블 + RLS 정책 (PRD §4)
- 스키마 경로: `db/schema/categories.ts` (named export `categories`)
- 필드: `id UUID PK, user_id UUID FK → users.id, name text NN, icon text, color text, is_system bool NN default false, sort_order int NN, created_at NN default now(), updated_at NN default now()`
- 마이그레이션: `db/migrations/0004_categories.sql` (drizzle-kit) + `db/migrations/0005_categories_rls.sql` (수기)
- RLS 정책: `categories` 모든 작업 본인만 (`auth.uid() = user_id`). **§J 정정-1 패턴 동일 적용** — application-layer `eq(user_id, currentUser.id)` 필수, RLS는 두 번째 방어선

### B. 기본 카테고리 3개 자동 시드
- callback handler에서 user upsert 직후 같은 트랜잭션으로 (💰 물질 / ⏰ 시간·행동 / 💝 마음) 3개 자동 insert
- `lib/categories/seed.ts` 모듈 신설 — `seedDefaultCategories(userId, tx): Promise<void>` (트랜잭션 인자 받음)
- callback handler가 사용자 첫 로그인 시점 감지 (users insert가 새로 일어났을 때만 — `onConflictDoNothing` 결과로 row가 생성되었는지 확인) → 기본 카테고리 insert
- 멱등성: 같은 user의 두 번째 로그인엔 기본 카테고리 추가 시드 안 함 (users insert가 conflict로 무시되면 시드도 skip)

### C. Server Action 패턴 (정정-1 동일)
- `app/(authenticated)/settings/actions.ts` (`"use server"`):
  - `createCategory(formData)`: user_id 서버 주입, `is_system=false` 강제, `sort_order = MAX+1`
  - `updateCategory(formData)`: 본인 카테고리만 (`and(eq(id, rawId), eq(user_id, currentUser.id))`), 시스템 카테고리는 name만 변경 가능
  - `deleteCategory({ id, migrateTo })`: 시스템 카테고리 throw, migrateTo 처리는 entries 슬라이스에서 결합 (이번 슬라이스엔 placeholder — entries 없으면 hard delete)
  - `reorderCategory(id, direction)`: sort_order swap, 시스템 카테고리 영역 침범 못함
  - `signOut()`: `supabase.auth.signOut()` + `redirect('/login')`

### D. 카테고리 추가 상한 = 20 (사용자 카테고리만, 시스템 제외)
**채택**: createCategory에서 본인의 `is_system=false` 카테고리 수 > 20 시 throw → Form Action useFormState로 메시지 표시. spec(시나리오 13)이 throw 가정으로 잠겨 있어 그대로.

**근거**: PRD에 명시 없는 사항이지만 카테고리가 너무 많으면 UI(드롭다운 select)·정렬 화살표 UX 깨짐. 20개는 충분히 여유 + UI 깔끔. V1 본인 사용 기준 5~10개로 안정될 예상.

### E. 시스템 카테고리 update — name만 변경, color/icon은 silent ignore
**채택**: frontend 모달에서 disabled 처리 + Server Action에서 `is_system=true`이면 update 객체에서 name만 추출. color/icon이 FormData에 들어와도 무시 (throw 안 함).

**근거**: throw는 사용자 친화 안 함 (잘못된 요청이 아닌 의도된 보호). silent ignore가 자연스럽고, frontend disabled로 발생 자체를 막아서 실제 도달 빈도 0. spec(시나리오 15)이 throw 없음 가정으로 통과.

### F. 카테고리 삭제 — 사용 중이면 이전 강제 (entries 슬라이스 결합)
- 이번 슬라이스: 기본 모달 골격만. `entryCount === 0` 가정 (entries 없음)이라 즉시 삭제 또는 entries `category_id` 옮김 placeholder
- entries 슬라이스: 실제 `category_id` 사용 검증 + 이전 강제 + 트랜잭션 (entries `category_id` 일괄 update → categories hard delete)
- 시스템 카테고리는 delete 버튼 hidden (디자이너 자율 결정), Server Action에서도 `is_system=true` 시 throw 가드

### G. 디자이너 자율 결정 8건 채택
1. 색상 풀 8개 (브랜드 톤 + 파스텔) — 자유 hex 거절
2. 시스템 카테고리 정렬 우선 (sort_order 비교 전 is_system 먼저)
3. 정렬 UX = 위/아래 화살표 (drag-and-drop은 V2 dnd-kit으로)
4. 시스템 카테고리 삭제 버튼 hidden (disabled 아님)
5. "기본" 배지 = text-xs muted outline
6. mock 2개 (worker가 db 결합 시 제거)
7. 사용자 카테고리 수 = 무제한 (§D로 권장 상한 20 굳힘)
8. 저장 버튼 outline (003 §G nova preset 그대로)

### H. test-writer 자율 결정 채택 + 후속 라운드 명시
1. seed 모듈 별도 신설 (`lib/categories/seed.ts`) 채택
2. 시나리오 13 throw 패턴 spec 그대로 — §D와 일치
3. 시나리오 15 throw 없음 — §E와 일치
4. RLS 단독 회귀 spec 신설 (시나리오 18·19·20) — 사용자 리뷰 🟡 #2 + sfx 🟢 #13 청산
5. **후속 라운드 명시**: worker가 `setAuthContext`를 async로 변환하면 기존 `tests/integration/friends/actions.test.ts`의 sync 호출이 깨짐 → Lead가 test-writer 단발 재호출해서 `await setAuthContext(...)` 일괄 갱신 (한 줄 변경). 시점: worker 인프라 청산 완료 + 자체 검증 통과 직전, peer 검증 직전

### I. 인프라 부채 청산 8건 (004 §"사용자 리뷰 응대" 그대로)
1. **`getCurrentUser` `react.cache()` 도입** — `lib/auth/user.ts`의 `getCurrentUser`를 `import { cache } from "react"` 래핑. 같은 RSC request 안에서 dedupe. middleware는 별도 컨텍스트라 영향 없음. layout + 자식 페이지 호출만 공유
2. **`setAuthContext` async + `resetAuthContext` + `asServiceRole` 신설** — `tests/integration/db-test-helpers.ts` 시그니처 갱신. afterEach hook에서 resetAuthContext 호출로 GUC 누수 방지. asServiceRole은 seed/cleanup용
3. **RLS 단독 회귀 spec** — test-writer가 이번 라운드에서 신설 (시나리오 18·19·20, `tests/integration/rls-isolation.test.ts`)
4. **sino-Korean 우회 원복** — `components/friends/friend-form-dialog.tsx`의 15·25일 sino-Korean aria-label hack 제거. spec이 `exact: true`로 강화되어 worker가 hack 제거해도 통과 (test-writer 이번 라운드에서 spec 갱신 완료)
5. **Windows path `fileURLToPath` 통일** — `tests/integration/db-test-helpers.ts:43`의 `path.dirname(new URL(...).pathname)` → `path.dirname(fileURLToPath(...))` (vitest.config:13 패턴 일치)
6. **`safeRevalidate` production warn** — `app/(authenticated)/friends/actions.ts:28-35` (그리고 categories actions에도 동일 패턴 적용)의 빈 catch에 `if (process.env.NODE_ENV === "production") console.warn(...)` 추가
7. **`PostgresError` type** — `app/auth/callback/route.ts:121`의 `(e as { code?: unknown }).code` cast → `import { PostgresError } from "postgres"` + instanceof 또는 typed cast. drizzle wrap 호환성은 worker가 검증 (instanceof 안 통하면 typed cast로)
8. **정정-1 패턴 categories 동일 적용** — `listCategories`, `updateCategory`, `deleteCategory` 등 모든 쿼리·액션에 `eq(categories.user_id, currentUser.id)` 명시. RLS는 두 번째 방어선

### J. README 동기화 점검
- 사이트맵 `/settings` 이미 명시 — 변경 없음
- 데이터 모델 `categories` 이미 명시 — 변경 없음
- "주요 기능" 표 카테고리 행 그대로
- 변경 필요 없으면 PR 본문에 "README 동기화 변경 없음" 명시

## 근거

- **categories 본격 도입**: friends에 이어 V1 핵심 엔티티. entries 슬라이스가 category_id FK를 참조하므로 entries보다 먼저 필요
- **기본 시드 시점 = callback handler**: trigger 대안은 Postgres function 관리 비용. callback에서 application-layer 시드가 가시성·테스트 용이. 003 §B와 일관
- **상한 20개**: PRD 누락 사항이지만 UX(드롭다운·정렬) 깨짐 방지. 토이 1인 사용 기준 충분
- **silent ignore vs throw**: 시스템 카테고리 보호는 의도된 readonly 영역 — throw는 사용자가 잘못한 게 아닌 UX 불친화. frontend disabled로 이중 보호
- **PR #3 잔여 8건 흡수**: 정정-1 패턴이 categories에 즉시 필요한 게 본질적 이유. 다른 7건은 같은 라운드에서 묶는 게 PR 분리 비용보다 효율적

## 거절된 대안

- **(A) categories 슬라이스와 PR #3 잔여 청산을 분리한 2 PR** — 정정-1 패턴이 categories 코드와 함께 결정되어야 하고, react.cache·setAuthContext async 등도 통합 spec 인프라 변경이라 분리 비용 큼. 거절
- **(B) 기본 카테고리 시드를 Postgres trigger로** — 함수 관리 비용·디버깅 복잡도. 003 §B 거절 사유 그대로. 거절
- **(C) 카테고리 상한 = 무제한** — UX 깨짐 위험. 거절. (사용자 명시 요청 시 V2에 무제한 토글 추가 검토)
- **(D) 시스템 카테고리 update color/icon = throw** — UX 불친화. 거절
- **(E) drag-and-drop 정렬** — V1 모바일 접근성 + 라이브러리 추가 비용. V2 dnd-kit으로 deferred. 거절
- **(F) `getCurrentUser` `react.cache()` 미도입 (현 상태 유지)** — Supabase Auth API 2회 호출 비용. friends-detail/entries 슬라이스에서 누적. 거절
- **(G) sino-Korean hack 유지** — 정책 마찰 노출 가치. spec 강화로 hack 제거가 정합. 거절

## 후속 영향

### 다음 슬라이스(entries-crud) 진입 시 결정 필요
1. entries 테이블 + RLS (PRD §4, 정정-1 패턴 동일 적용)
2. `category_id` FK 정책 — 카테고리 삭제 시 cascade vs migrateTo 강제 (§F 결합)
3. `repayment_timing` enum (PRD §3 보답 시점 4종)
4. 신세 추가/수정/삭제 모달 + 친구 combobox + 인라인 친구 빠른 생성
5. `e2e-store` entries 도메인 확장 (PR #3 잔여 #9)
6. QuickAddFab 결합 (현재 placeholder)
7. /entries 리스트 페이지 (검색·필터·날짜 범위)
8. friends/[id] 받은 신세 타임라인 결합

### V1 마무리 직전 별도 `/meta` 슬라이스 (deferred)
- Playwright CI 빌드 모드 분기 (`next build && next start`)
- `next lint` → eslint flat config 마이그레이션
- nonce 기반 strict CSP (V2 보안 슬라이스)
- `getDb()` lazy factory 패턴 + dynamic import 환원 (V2 또는 별도 슬라이스)

### V2 메모
- 카테고리 drag-and-drop 정렬 (dnd-kit)
- 카테고리 상한 무제한 토글
- 카테고리 색상 = 자유 hex picker
- 친구 사진 업로드 (V1 이니셜 아바타)
- 다크 모드, 휴지통 복구 UI

---

## 사용자 PR #4 종합 리뷰 응대 (2026-05-12, append)

사용자 리뷰(https://github.com/wodn5515/boon/pull/4#issuecomment-4428804453)에서 6건 코멘트 + "머지 가능 ✅" + 슬라이스 운영 방식 긍정 평가. 모두 entries 슬라이스로 **deferred** — 이번 PR 추가 라운드 없음.

### 사용자 명시 평가
> "이번 슬라이스는 카테고리 도메인 자체보다도 'PR #3 부채를 끝까지 갚으면서 새 도메인을 깨끗하게 시작하는 방법'에 대한 좋은 사례. 부채 청산을 다음 슬라이스로 미루지 않고 같은 PR에 묶어 처리한 판단이 옳았다 — 정정-1 패턴이 친구/카테고리 둘 다 일관되어 entries 슬라이스 진입이 자연스러워졌다."

이 평가는 향후 슬라이스 운영 원칙으로 인계: **부채 청산 ↔ 새 도메인 도입은 분리보다 통합이 자연스러움** (정정-1 같은 패러다임 전환이 후속 슬라이스의 베이스가 되는 경우).

### entries 슬라이스 첫 작업 우선순위 (사용자 권고 6건, 그대로 006 결정 로그로 인계)

1. **🟡 #1 `signOut` 실패 시 cookie fail-safe** — `supabase.auth.signOut()` 네트워크 실패 시 sb-{ref}-auth-token 쿠키가 살아남아 자동 재로그인되는 silent bug. fail-safe로 `cookieStore.delete()` 또는 결정 로그에 트레이드오프 명시 (cookies 강제 삭제 채택 권장 — 사용자 의도와 실제 동작 일치)
2. **🟡 #2 `CategoryItem` `isFirst`/`isLast` 그룹 경계** — 통합 인덱스 → 그룹별 인덱스(`userStartIdx`)로 분리. 한 줄 수정 (사용자가 "본 PR 안에서 처리 가능"이라 명시했으나 entries 슬라이스 첫 cleanup으로 묶음)
3. **🟢 #3 `setAuthContext` parameterized** — `sql.raw('SET request.jwt.claims = \\'${escaped}\\'')` → `sql\`SELECT set_config('request.jwt.claims', ${claims}, false)\``. SQL injection 사각지대 제거. `SET ROLE`은 hardcoded literal이라 raw 유지
4. **🟢 #4 `safeRevalidate` 공통화** — `lib/server/revalidate.ts` 추출. entries 슬라이스 actions에도 같은 패턴 쓸 거라 그 시점에 한 번에 정리
5. **🟢 #5 `CategoryFormDialog` color hidden input 제거** — `formData.set("color", color)` (handleSubmit) + `<input type="hidden">` 둘 다 있음. controlled state가 handleSubmit에서 합류하는 패턴이 명확. hidden 제거
6. **💬 #6 `signOut` 트레이드오프 결정 로그 명시** — 본 슬라이스 §C의 `signOut` 항목에 cookie 잔존 트레이드오프 한 줄 추가 + cookies fail-safe 채택 결정을 entries 슬라이스 첫 커밋에 묶음

### 머지 차단 사유
**없음** — 모든 항목이 should·nit·question 수준이며, 사용자가 명시적으로 "머지 가능 ✅"·"entries 슬라이스에서 묶어 처리"로 판정.

### Lead 판단 채택 사유
- 사용자 권고 그대로 "entries 슬라이스에서 묶음" 채택. 16 커밋의 큰 PR이라 깔끔히 머지 + 결정 로그 트레이스 보존
- entries 슬라이스(006)는 본 슬라이스의 정정-1 패턴 + RLS 단독 회귀 spec + pglite 헬퍼 위에서 자연스럽게 시작 — 사용자 평가대로 베이스 일관성 확보됨
- 다음 슬라이스 진입 시 006 결정 로그 첫머리에 본 섹션 인용 + 우선순위 6건 그대로 인계