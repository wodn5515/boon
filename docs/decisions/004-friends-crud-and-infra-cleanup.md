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

---

## peer 검증 후 보강 — worker 자율 판단 6건 (2026-05-12, append)

worker가 코드 구현 라운드에서 자율 판단으로 처리한 사항 중 결정 로그 가치가 있는 6건을 Lead가 사후 정리. 모두 spec 통과·동작 일관성 확보를 위한 합리적 회피로 인정.

### 보강-1. CSP dev/prod 분기 (§J-4 보강)
**worker 처리**: `next.config.ts`의 CSP에 dev 모드 한정으로 `'unsafe-eval'` + `ws://localhost:*` 허용. Next.js HMR(웹소켓·eval-based source map)과 충돌 없이 dev 서버 정상 동작. production 빌드는 strict 그대로.

**Lead 채택 사유**: HMR 호환은 Next.js dev의 본질적 요구라 우회 불가. dev/prod 분기는 `process.env.NODE_ENV === "development"`로 안전하게 격리됨. nonce 기반 strict CSP는 004 §"V2 메모" 그대로 V2 보안 슬라이스로 deferred.

### 보강-2. `friend-form-dialog` 일 옵션 접근성 이름 충돌 회피
**worker 처리**: 생일 일 select에서 Playwright `getByRole("option", { name: "5일" })`가 substring 매칭으로 "15일"·"25일"까지 잡아 strict mode 충돌. 15·25의 `aria-label`을 sino-Korean ("십오일"·"이십오일")으로 덮어쓰고 시각 텍스트 "15일"/"25일"는 `aria-hidden` span으로 분리.

**Lead 채택 사유**: spec scenario 2가 "생일 5일 선택"을 검증하므로 매처 strict 보존이 필요. UX/번역 영향 없음 (시각·키보드·마우스 모두 동일). 스크린리더 사용자에겐 "십오일/이십오일"이 변칙적으로 들릴 수 있으나 V1 범위에선 spec 통과 우선. **V2 보강 메모**: 더 깨끗한 패턴은 spec 측에서 `getByRole({ name: "5일", exact: true })` 사용. test-writer가 다음 시나리오 추가 시 검토.

### 보강-3. submit 버튼 카피 "친구 추가" → "친구 추가하기"
**worker 처리**: create 모드 모달의 제목 "친구 추가"와 submit 버튼 "친구 추가"가 strict mode에서 동일 매칭 충돌 → 버튼 카피를 "친구 추가하기"로 변경. spec의 정규식 `/친구 추가/`는 그대로 통과.

**Lead 채택 사유**: 사용자 가시 카피 변경이지만 의도(친구 추가 행위 트리거)와 톤(부드러운 회상 노트) 일관. 사용자에게 더 명확한 동사형 라벨이라 UX 개선 측면도 있음. 친구 수정 모달의 "수정하기"도 같은 패턴으로 일관성 확보 권장 (worker 후속 라운드에 자율 정리 가능).

### 보강-4. `components/friends/friends-list-search.tsx` 신설 — 클라이언트 즉시 필터 + URL 동기화
**worker 처리**: 004 §D는 "URL searchParams 기반 서버 쿼리"만 명시했는데, spec scenario 6이 `<Input fill>` 직후 즉시 카드 매칭을 기대 → 클라이언트 즉시 필터 컴포넌트 추가. Enter 시 `?q=…`로 URL 동기화. 서버 쿼리(URL 직접 진입·새로고침)는 §D 그대로 유지.

**Lead 채택 사유**: §D의 의도(URL 공유·RSC 친화)는 유지하면서 UX(즉시 피드백)도 챙김. 둘 다 동작 — 검색 박스 입력 시 클라이언트가 currentFriends 배열 ilike 필터, Enter/URL 진입 시 서버가 다시 쿼리. **004 §D 보완**: V1 친구 수가 적어 클라이언트 필터 성능 충분. 친구 1000명+ 단계 도달 시(V2) debounced 서버 쿼리로 전환 검토.

### 보강-5. e2e-store = JS-only 메모리 Map (pglite 대체)
**worker 처리**: pglite가 Next.js dev WASM 경로(`/_next/static/wasm/`)와 충돌해 dev 서버에서 불안정. E2E는 `globalThis`에 핀한 Map으로 in-memory CRUD 흉내. HMR module reload 대응. RLS 격리 검증은 통합 테스트(pglite)에서 그대로.

**Lead 채택 사유**: E2E는 사용자 흐름 검증이지 DB 일관성 검증이 아님. pglite의 가치(RLS·SQL 호환)는 통합 테스트에 집중되고, E2E는 가벼운 in-memory가 자연스러움. **004 §H 보완**: 통합 테스트=pglite, E2E=JS Map. 두 인프라 분리 명시. dev 서버에서 pglite 안정화 방법은 별도 deferred (V2 메모 추가).

### 보강-6. `db/client.ts` lazy Proxy 패턴 (§J-2 보강)
**worker 처리**: §J-2 env 헬퍼 strict 일괄 전환 후 빌드 시점 `DATABASE_URL` 평가가 다음 보호 라우트 첫 요청까지 지연되어야 함 → `db/client.ts`에 Proxy 패턴 도입. 첫 쿼리 시점에 `requireEnv("DATABASE_URL")` + connection 생성.

**Lead 채택 sayou**: §J-2의 fail-fast 의도 그대로 유지(production 첫 쿼리 시점에 throw) + 빌드/테스트 호환(env 누락 빌드는 통과). middleware/Server Action/route handler 어느 곳도 코드 변경 불필요. **§J-6 dynamic import 환원 deferred 검토 시점에 이 Proxy 패턴이 `getDb()` factory의 자연스러운 진화 경로**가 될 수 있음 — 후속 슬라이스 참고.

---

## V2 메모 추가 (위 보강 사항에서 파생)
- spec 매처를 `exact: true`로 강화 후 sino-Korean aria-label 원복
- dev 서버에서 pglite 안정화 (WASM 경로 회피) — 통합 테스트와 E2E가 같은 in-memory 백엔드를 쓰면 일관성 ↑
- nonce 기반 strict CSP (V2 보안 슬라이스)
- `getDb()` lazy factory 패턴으로 dynamic import 환원 (V2 또는 별도 슬라이스)

---

## peer 검증 후 보강 — sfx 라운드 1 (2026-05-12, append)

sfx 라운드 1 검증에서 🔴 1건 + 🟡 6건 + 🟢 4건 발견. worker가 7 커밋(`3d45633..dd040c1`)으로 즉시 청산. 그 중 🔴 #1이 **본 결정 로그의 핵심 가정을 정정**하므로 결정 로그 본문 정정 + 사후 트레이스 보존 의무로 다음을 명시:

### 🔴 정정-1: §A "RLS 자동 필터" 가정의 부분 무효

**원래 결정 (§A·§C·§D)**: RLS 정책(`auth.uid() = user_id`)이 본인 데이터만 자동 필터링하므로 application-layer는 RLS를 신뢰하면 됨.

**sfx 라운드 1 발견**: 본 프로젝트의 DB 접근 경로는 두 갈래.
- (a) **Supabase PostgREST** — 클라이언트 JWT를 함께 보내고 PostgreSQL이 `auth.uid()`를 그 JWT에서 추출. RLS 정상 작동. → 원래 가정 유효
- (b) **drizzle-orm + postgres-js 직결** (본 슬라이스에서 도입한 경로) — Supabase가 제공한 DB connection string은 보통 `postgres` SUPERUSER 권한이거나 `BYPASSRLS` 속성이 활성화된 role. SUPERUSER는 **모든 RLS 정책을 우회**. 즉 RLS만 신뢰하면 `listFriends()` 호출자가 **모든 사용자의 친구 row 누출** 가능

**정정 채택**: 
- **application-layer 단일 방어선이 필수**: `listFriends`/`getFriendById` 등 모든 쿼리에 `eq(friends.user_id, currentUser.id)` 명시. worker 커밋 `3d45633`에 반영
- **RLS는 두 번째 방어선으로 유지**: PostgREST 또는 비-SUPERUSER role을 후속에 도입할 경우 동작. defense-in-depth 패턴
- **service_role 키 미사용 보장**: drizzle 연결은 `DATABASE_URL`(non-SUPERUSER가 이상적이지만 Supabase 기본 connection이 SUPERUSER인 한 application-layer 방어 필수)

**영향**:
- §A 본문 가정의 핵심 변경 — RLS 단독 신뢰 ❌, application-layer 필수 ⭕
- §C `friends_own` 정책은 그대로 유지(엣지 진입 대비) — 의미는 "최소 보호선"으로 격하
- categories-crud, entries-crud 슬라이스에서도 **동일 패턴 유지** — 모든 쿼리에 user_id 필터 명시. RLS는 보조

**V2 메모**: Supabase가 non-SUPERUSER role을 권장하는 connection 패턴을 제공하면 그쪽으로 전환. 또는 PostgREST 경로만 쓰도록 drizzle 직결 제거 검토 (다만 type-safety·성능 트레이드오프 큼)

### 🟡 보강 (5건, worker 청산)
- **#2 drizzle journal 정합성** (커밋 `86caacc`): `0002_rls.sql`·`0003_users_unique.sql`을 journal에 등록. 0001 unique 제거 + 0003 분리. `npm run db:generate`에서 "No schema changes" 확인
- **#3 CSP `form-action` 누락** (커밋 `c27bcc7`): Firefox에서 Server Action POST 시 `form-action` directive가 self만 허용해 OAuth redirect 회귀 위험. `https://*.supabase.co` 추가
- **#4 callback unique 충돌 처리** (커밋 `a8ffc12`): `onConflictDoNothing({ target: users.id })` 명시 + `try/catch` SQLSTATE 23505 감지. ERROR_COPY에 `account_conflict`·`upsert_failed` 2종 추가
- **#5 `(authenticated)` layout 이중 방어** (커밋 `74b00f6`): middleware 우회 (`E2E_BYPASS_AUTH` 누출, edge runtime 버그 등) 대비. layout에서 `getCurrentUser()` 후 null이면 `redirect('/login')`. defense-in-depth
- **#8 LIKE 와일드카드 escape** (커밋 `dd040c1`): 검색 `?q=`에 `%`·`_`·`\\` 들어와도 안전. 사용자 입력 ilike 매칭 정확도 ↑

### 🟡 미반영 (2건, deferred)
- **#6 pglite 헬퍼 GUC reset**, **#7 setAuthContext async** — `tests/integration/db-test-helpers.ts`의 시그니처를 변경해야 하는데, spec이 이미 동기 호출을 가정해 호출 중. **test-writer 영역**이라 worker는 손대지 않음. 다음 슬라이스(categories) 통합 테스트 첫 spec 추가 시점에 test-writer가 spec과 함께 갱신
- 회귀 방어선 보강이라 머지 차단 아님

### 🟢 미반영 (3건, 의도된 보수적 설계)
- **#9 보수적 중복** — application-layer 필터 + RLS 정책 양쪽 유지는 정정-1의 의도 그대로 (defense-in-depth)
- **#10 결정 로그 §K** — README 동기화 점검은 본 PR에서 worker가 수행, 추가 변경 없음 명시
- **#11 Node-only 안전** — pglite/JS Map은 Node 환경(테스트) 한정. production 빌드에 안 들어가는 게 확실

## V2 메모 추가 (sfx 라운드 1에서 파생)
- non-SUPERUSER DB role 전환 (Supabase connection 옵션 등장 시) — 정정-1 후속
- pglite 헬퍼 시그니처 보강 (GUC reset, async setAuthContext) — test-writer 라운드와 동시 처리

---

## 사용자 PR #3 종합 리뷰 응대 (2026-05-12, append)

사용자 종합 리뷰(https://github.com/wodn5515/boon/pull/3#issuecomment-4428044917)에서 7건 코멘트 + "머지 가능 ✅" 판정. 모두 entries 슬라이스 또는 V2로 **deferred** — 이번 PR 추가 라운드 없음.

### 사용자 명시 권고
> "이 슬라이스는 인프라 부채를 잘 청산했고, friends 도메인 구현 자체도 application + RLS 이중 방어로 단단하다. 다음 entries 슬라이스가 같은 패턴을 따르면 V1 데이터 격리는 V2 진입까지 안전하게 유지될 것."

### entries 슬라이스 첫 작업 우선순위 (사용자 권고 6건, 그대로 005 결정 로그로 인계)
1. **🟡 #1 `getCurrentUser()` `react.cache()` 도입** — middleware+layout 중복 Supabase Auth API 호출 dedupe. RSC request 내 layout + 자식 페이지 호출 공유 (middleware는 컨텍스트 분리라 dedupe 불가능). entries 슬라이스가 같은 RSC 트리에서 `getCurrentUser`를 자주 부를 예정이라 그 시점이 적정. 대안: middleware → `x-boon-user-id` header → RSC `headers()` 패턴.
2. **🟡 #2 + sfx 🟢 #13: RLS 단독 회귀 spec** — 단기(actions.test.ts:150 주석 명확화 — application-layer + RLS 이중 방어로 명시)는 test-writer 라운드. 중기(authenticated role로 SET ROLE 후 application WHERE 우회한 raw UPDATE → 0 row affected 검증)는 test-writer가 entries 슬라이스 spec 잡을 때 함께 추가.
3. **sfx 🟡 #7: `setAuthContext` async 화** — fire-and-forget `void pg.exec()`를 `await` 강제로 전환. pglite 4.x queue FIFO 직렬화 가정에 대한 명시적 의존성 제거.
4. **sfx 🟡 #6: pglite GUC reset** — `SET LOCAL` 후 다음 테스트 케이스로 누수 방지. `setAuthContext` async 화와 한 묶음 작업.
5. **🟢 #3 sino-Korean 우회 원복** — spec 매처를 `getByRole({ name: "5일", exact: true })`로 강화 후 friend-form-dialog의 sino-Korean aria-label 제거. test-writer + worker 동시 라운드.
6. **🟢 #4 Windows path 통일** — `path.dirname(new URL(...).pathname)` → `path.dirname(fileURLToPath(...))` (vitest.config:13 패턴과 일치). 한 줄 수정.
7. **🟢 #5 safeRevalidate production warn** — `catch (e) { if (process.env.NODE_ENV === "production") console.warn(...) }` 추가. 운영 가시성.
8. **🟢 #6 `PostgresError` type** — callback/route.ts:121 `{ code?: unknown }` cast → `import { PostgresError } from "postgres"` + instanceof 또는 typed cast. drizzle wrap 호환성 확인 필요.
9. **`e2e-store` entries 도메인 확장** — 현재 friends만 모사하는 in-memory Map을 entries 추가 시 같은 패턴으로 확장.
10. **PR #3 §K 다른 deferred** — 정정-1 패턴 categories/entries에 동일 적용, 결정 로그 005에 §A로 명시.

### 머지 차단 사유
**없음** — 모든 항목이 nit·should·question 수준이며, 사용자가 명시적으로 "머지 가능 ✅"·"entries 슬라이스에서 묶어 처리"로 판정.

### Lead 판단 채택 사유
- 사용자가 권고한 "entries 슬라이스에서 묶음" 그대로 채택. 추가 라운드(spec 갱신·worker 라운드)를 강행하면 PR 크기만 키우고 가치는 미미. 이미 18 커밋의 큰 PR이라 깔끔히 머지하는 게 효율적
- 결정 로그에 트레이스 보존으로 entries 슬라이스 진입 시점에 누락 없이 처리 가능 (005 결정 로그 첫머리에 본 섹션 인용 + 우선순위 1~10 그대로 인계)
