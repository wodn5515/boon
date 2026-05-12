# 004-friends-crud-and-infra-cleanup: 친구 CRUD + 인프라 부채 일괄 청산

> 작성: 2026-05-12  /  작성자: Lead 에이전트
> 관련 작업: feature/friends-crud

## 배경

PRD §3 친구 관리(목록·상세·CRUD)를 V1 본격 도메인 첫 슬라이스로 진입. 동시에 003 §J + PR #2 사용자 리뷰에 누적된 인프라 부채 8건을 본 슬라이스에서 일괄 청산한다 (사용자 의도 "일괄 정리" 인자로 지시).

이번 슬라이스에서 결정해야 할 항목이 매우 많아 거대 PR이 예상되지만, 인프라 부채를 다음 슬라이스로 또 미루면 친구 CRUD 작업 자체가 그 부채(특히 테스트 typecheck, RLS, pglite)에 의존하기 때문에 통합이 자연스러움.

## 결정

### A. friends 테이블 + RLS 정책 (PRD §4)
- **스키마 경로**: `db/schema/friends.ts` (named export `friends`)
- 필드: `id UUID PK, user_id UUID FK → users.id, name text NN, birthday_month int, birthday_day int, note text, is_deleted boolean NN default false, created_at timestamp NN default now(), updated_at timestamp NN default now()`
- **마이그레이션**: `db/migrations/0001_friends.sql` (drizzle-kit generate)
- **RLS 정책**: `db/migrations/0002_rls.sql`
  - `users`: RLS on. SELECT/UPDATE 본인(`auth.uid() = id`)만. INSERT는 callback handler가 service role로 우회.
  - `friends`: RLS on. 모든 작업 본인(`auth.uid() = user_id`)만.
  - `categories`/`entries`: 이번 슬라이스에 테이블 없음. 다음 슬라이스에 동일 패턴.

### B. Server Action 패턴 (Next.js 15 App Router)
- 경로: `app/(authenticated)/friends/actions.ts`
- `createFriend(formData)`, `updateFriend(formData)`, `deleteFriend(id)` (모두 `"use server"`)
- `user_id`는 `getCurrentUser()`로 서버측 자동 주입 (클라이언트가 위조 못함)
- 성공 시 `revalidatePath('/friends')` + 모달 내부에서 `useFormState` 또는 `useFormStatus`로 닫힘 처리

### C. Soft delete (D-017)
- `friends.is_deleted = true`로 표시. hard delete 하지 않음
- `listFriends` 쿼리에서 `where eq(friends.is_deleted, false)` 필터
- 받은 신세(entries) 데이터는 보존되지만 UI에서 미노출 (entries 슬라이스에서 검증)

### D. 검색 = URL searchParams 기반 서버 쿼리 (test-writer 요청 3)
- 디자이너 골격의 `<Input type="search">`를 form/Link로 래핑해 `/friends?q=<텍스트>`로 GET
- `app/(authenticated)/friends/page.tsx`의 `searchParams.q`를 받아 `ilike(friends.name, '%q%')` 필터
- URL 공유 가능, RSC 친화. 클라이언트 필터(client-side debounce + state) 대안은 V2에 검토

### E. 디자이너 자율 결정 채택 (11건, 디자이너 보고 인용)
1. 이니셜 아바타 HSL 풀 6색 (브랜드 톤 통일)
2. 이니셜 추출: 한글/CJK 1자, 영어 2자(대문자), fallback `"?"`
3. 친구 폼 필드 순서: 이름 → 생일(월/일) → 메모 (PRD §3 그대로)
4. 생일: 월·일 둘 다 선택해야 저장 (한 쪽만은 의미 모호)
5. 친구 폼 저장 버튼 = `variant="outline"` (003 §G nova preset 정책)
6. 모바일 4탭 명칭: "홈 / 친구 / 신세 / 설정" (PRD §5 라우트)
7. 데스크톱 네비 = 상단 sticky 가로 (사이드바는 V2 위젯 확장 시 재논의)
8. FAB 위치 = 모바일 `bottom-20 right-4`, sm+ `bottom-8 right-8`
9. 빈 상태 카피 = "아직 등록된 친구가 없어요" + "첫 친구를 추가하면 받은 마음을 차곡차곡 모을 수 있어요" (강박 톤 회피 — CLAUDE.md §2)
10. 친구 삭제 카피 = D-017 cascade 알림 + "휴지통 미제공 (V1)" 부가 경고
11. **`(authenticated)` 라우트 그룹** 도입 — middleware 인증 통과 후 layout 적용. `/login`은 외부.

### F. test-writer 자율 결정 채택
1. `formatBirthday`가 `null` 반환 (디자이너 구현 유지). 빈 문자열 통일 안 함 — `null` 분기로 UI 다음.
2. E2E fixture user(`...000001`) vs 통합 user(`...0000aa`/`...0000bb`) UUID 격리
3. 통합 시그니처: `createTestDb()`, `setAuthContext(testDb, userId)`, `pg.query(sql, params)` — worker가 이대로 구현
4. 시나리오 13 RLS 실패는 throw로 (명시적 권장, 다만 silent도 spec 통과 가능)
5. 단위 테스트 시나리오 14·15·16은 회귀 방어선 (디자이너가 이미 구현해 빨강 만들 수 없음) — 유지

### G. 테스트 typecheck 인프라 (🟡 #1, 우선순위 1)
**채택**: `vitest.config.ts`에 `test.typecheck = { enabled: true, tsconfig: "./tsconfig.test.json" }` + `tsconfig.test.json` 신설.
- `tsconfig.test.json`은 `tsconfig.json`을 extends하고 `include`에 `tests/**`, `e2e/**`, `vitest.setup.ts`, `playwright.config.ts` 추가
- worker는 PR #2 callback-route.test.ts의 `as Record<string, unknown>` 같은 cast를 `vi.mocked()` 또는 `MockInstance` 타입으로 정리해 typecheck 통과

### H. 통합 테스트 인프라 = pglite
- `@electric-sql/pglite` devDependency 추가
- `tests/integration/db-test-helpers.ts`:
  - `createTestDb()`: pglite 인스턴스 생성 + drizzle 마이그레이션 적용 (`0001_friends.sql`, `0002_rls.sql` 순)
  - `setAuthContext(testDb, userId)`: `SET LOCAL request.jwt.claims = '{"sub": "..."}'` (Supabase RLS 호환 패턴)
  - cleanup으로 트랜잭션 롤백 또는 truncate
- 장점: in-memory, 빠름(<1초 init), CI 친화, Supabase CLI 셋업 불필요
- 단점: auth.users 테이블 없음 → mock users.id UUID 직접 insert
- callback handler 통합 테스트(PR #2)도 점진 pglite로 전환 검토 (다음 슬라이스 dynamic import 환원 논의 시)

### I. RLS 컨텍스트 주입 = `SET LOCAL request.jwt.claims`
- Supabase의 RLS auth.uid()는 `current_setting('request.jwt.claims')::json->>'sub'`을 읽음
- pglite에서 동일하게 동작 (Postgres 호환 GUC)
- service role 우회는 별도 helper (`asServiceRole(testDb, fn)`)로 명시화

### J. PR #2 잔여 인프라 부채 일괄 청산 (8건)
1. **테스트 typecheck** → §G에서 처리
2. **env 헬퍼 strict 일괄 전환**: `lib/env.ts`의 `requireEnv()`를 `lib/supabase/{server,client}.ts`, `db/client.ts`, `middleware.ts`에서 직접 호출. `process.env[...] ?? "placeholder"` 패턴 제거. production에서 누락 시 fail-fast.
3. **callback ERROR_COPY 확장**: `app/auth/callback/route.ts`의 `exchange_failed`를 `invalid_grant` / `expired_code` / `network_error`로 세분화. `/login`의 ERROR_COPY 5종 → 7~8종 확장.
4. **CSP 헤더 추가**: `next.config.ts`의 보안 헤더에 CSP 추가:
   - `default-src 'self'`
   - `script-src 'self' 'unsafe-inline'` (Next.js inline hydration용)
   - `style-src 'self' 'unsafe-inline'` (Tailwind/shadcn)
   - `img-src 'self' data: https://lh3.googleusercontent.com` (Google 프로필 이미지)
   - `font-src 'self'` (Pretendard 정적)
   - `connect-src 'self' https://*.supabase.co`
   - `frame-ancestors 'none'`
5. **`users.email`/`google_id` unique 제약**: `db/migrations/0003_users_unique.sql` 추가 — `ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);` (google_id는 NULL 허용이라 partial index: `CREATE UNIQUE INDEX users_google_id_unique ON users (google_id) WHERE google_id IS NOT NULL;`)
6. **dynamic import 환원** → **worker 작업 중 환원 불가 판명, 유지 결정으로 변경** (Lead 응대 라운드 §1 참고). 환원은 별도 슬라이스로 deferred.
7. **AuthError type import**: `app/auth/callback/route.ts`의 `(error as { code?: string } | null | undefined)?.code` 캐스트 → `import type { AuthError } from "@supabase/supabase-js"`로 한 줄 정리.
8. **pglite 헬퍼** → §H에서 처리

### K. README 동기화 의무
- `/friends`, `/friends/[id]` 라우트가 사이트맵에 이미 명시되어 있음 → 큰 갱신 없음
- 데이터 모델에 `friends` 이미 명시 → 변경 없음
- "주요 기능" 표 친구 관리 행 그대로
- 다만 변경된 부분: 의존성에 `@electric-sql/pglite` 추가 (devDependency), `next/font/local` 폰트 동작 등은 본문 큰 영향 없음
- 변경 필요 시 worker가 갱신

## 근거

- **friends 본격 도입**: PRD §3·§4의 핵심 엔티티. 후속 슬라이스(categories, entries)가 friends를 참조하므로 가장 먼저.
- **RLS 본격 정의**: V1 단일 사용자라도 RLS 패턴을 표준화해야 categories/entries에 그대로 적용 가능. 003 §B에서 미룬 결정 청산.
- **pglite 채택**: Supabase CLI 로컬은 docker 의존이라 토이 단계에 무거움. pglite는 단일 npm 패키지로 in-memory Postgres + RLS 작동. 결정적 테스트 + CI 빠름.
- **인프라 부채 통합**: 작업 흐름상 자연스러움 — friends RLS 정의 = users RLS 정의 = unique 제약 = pglite 헬퍼 모두 한 묶음. 분리 시 PR 라운드 비용 증가.
- **테스트 typecheck**: 다음 슬라이스부터 통합 테스트 양이 폭발할 예정이라 미루면 사각지대 폭이 커짐. 지금이 마지노선.
- **검색 URL 기반**: RSC 친화 + 공유 가능 URL. Next.js 15에서 form action + URL을 자연스럽게 결합.

## 거절된 대안

- **(A) friends 슬라이스와 인프라 부채를 분리한 2 PR** — 작업 의존 결합도 높음 (friends 통합 테스트는 pglite 필요). 거절.
- **(B) Supabase 로컬(docker)을 통합 테스트 인프라로** — 토이 단계에 docker 의존 무거움. pglite로 충분. 거절.
- **(C) `users.email`/`google_id` unique를 V2로 또 미룸** — RLS 정의와 함께 잡는 게 정합성. 거절.
- **(D) middleware에 매번 RLS 컨텍스트 직접 주입** — Supabase SSR helper가 sb 쿠키 → JWT → auth.uid() 흐름을 자동 처리. middleware가 직접 SET LOCAL 호출하는 건 RSC 흐름에 맞지 않음. service role 키도 우회로 동일. 거절.
- **(E) 검색을 클라이언트 필터(`useState`)로** — V1 친구 수가 적어 성능 차이 없지만 URL 공유/북마크가 불가능. 거절.
- **(F) `formatBirthday`를 `""`로 통일** — 디자이너 구현(`null` 반환) 그대로 두면 UI가 분기 처리. 둘 다 동작. 변경 비용 vs 명확성 트레이드오프에서 현 상태 유지. 거절.
- **(G) Button default variant hover 색 추가** — 003 §G 정책 그대로 nova preset 유지. 거절.
- **(H) CSP를 strict하게 (`'unsafe-inline'` 제거)** — Next.js inline hydration 깨짐. nonce 기반 CSP는 V2 보안 강화 슬라이스로 deferred. 거절.

## 후속 영향

### 다음 슬라이스(categories-crud) 시작 시 필수 결정
1. RLS 패턴이 friends와 동일하게 categories에 적용되는지 검증
2. 기본 카테고리 3개 시드 전략 (callback handler에서 user 첫 생성 시 자동 insert vs 별도 trigger)
3. 카테고리 삭제 시 entries 이전 강제 흐름 (PRD §3 카테고리 관리 — V2 entries 슬라이스에서 결합 가능)

### 이번 슬라이스 deferred 항목 (005+)
- **Playwright CI 빌드 모드 분기** (GitHub Actions 셋업 시점, 본 슬라이스에 안 들어감) — 별도 `/meta` 또는 entries 슬라이스 끝나면 묶음
- **`next lint` → eslint flat config 마이그레이션** — V1 마무리 직전 별도 `/meta`
- **nonce 기반 CSP 강화** — V2 보안 슬라이스
- **단일 카드 hover 마이크로 인터랙션 (transform: translateY)** — 디자이너가 추측 없이 묶지 않음. 첫 도메인 사용자 체감 후 결정

### V2 메모
- 친구 사진 업로드 (V1은 이니셜 아바타)
- 친구 복구 UI (휴지통)
- 데스크톱 좌측 사이드바 네비 (위젯 수 증가 시)
- 단일 친구 카드 onhover 트랜지션

---

## Lead 응대 라운드 (worker 보고 응대, 2026-05-12)

worker가 인프라 부채 §J 항목 적용 중 spec 충돌 2건 보고. Lead 자율 판단 결과 반영.

### §1. §J-6 dynamic import 환원 → 유지로 변경 (불가 판명)

**worker 보고**: `app/auth/callback/route.ts`의 `await import("@/db/client")` / `await import("@/db/schema/users")`를 static import로 환원하면 `tests/integration/auth/callback-route.test.ts`의 `vi.mock("@/db/client", () => ({ db: { insert: dbInsert } }))` 패턴이 TDZ 에러로 깨짐 (`Cannot access 'dbInsert' before initialization`). 깨끗하게 환원하려면 `db/client.ts`에 lazy factory(`getDb()`) 도입이 전제 — callback handler 외 모든 호출처(queries, Server Action 등)도 같이 손대야 함.

**결정**: 이번 슬라이스에서 dynamic import 그대로 **유지**. 환원 시도 비용 > 청산 가치 (route 한 곳만 dynamic이고 성능 영향 사실상 0). worker는 route.ts의 "Lead 보류" 같은 임시 주석 없이 깨끗한 dynamic import 유지.

**deferred (이번 슬라이스 외)**:
- `db/client.ts`에 lazy factory(`getDb()`) 패턴 도입 시 환원 — 별도 `/work` 슬라이스. 트리거 시점: callback handler 외 다른 곳에서도 통합 테스트가 db/client mock을 필요로 할 때, 또는 V2.

### §2. §G 테스트 typecheck 인프라 — PR #2 spec 한 줄 cast 정리

**worker 보고**: §G 셋업 후 `npm run typecheck:tests`가 `tests/integration/auth/callback-route.test.ts:102`의 `insertValues.mock.calls[0]?.[0] as Record<string, unknown>` 캐스트에서 TS2352/TS2493 에러. 사용자 PR #2 종합 리뷰 🟡 #1이 정확히 짚은 패턴. runtime은 48/48 통과 중이라 동작 이상 없음.

**결정**: test-writer 단발 재호출로 spec 한 줄만 `vi.fn` 인자 시그니처 명시 패턴으로 정리. 의미·동작 무변. (worker는 spec 수정 권한 없음 — 정책 보호)

**처리**: test-writer 라운드에서 `vi.fn<(values: Record<string, unknown>) => unknown>` 시그니처 적용 (옵션 2). Vitest v4의 제네릭 시그니처가 함수 형태라 worker가 안내한 튜플 형태(`vi.fn<[T], R>`)는 TS2558로 거절됨 — test-writer가 함수 시그니처로 보정. 102~104줄의 후속 접근(`inserted.id`, `inserted.email`)은 그대로 보존되어 다른 줄 영향 0. 커밋 `d95769e`.

**결과**: `npx tsc --noEmit -p tsconfig.test.json` 전체 통과, runtime 48/48 무변. §G 완료.

### §3. 결정 로그 갱신 절차 (worker 위임 금지 확인)

worker가 본 결정 로그를 직접 수정하지 않고 Lead에 보고한 것은 정책 일치. CLAUDE.md §12 "Lead 자율 판단 + 결정 로그 작성 의무"의 트레이스 보존을 유지함. worker는 결정 로그 영역에 손대지 않고 코드·인프라 부채에만 집중. 앞으로도 같은 흐름.
