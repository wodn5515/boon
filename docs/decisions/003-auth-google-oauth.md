# 003-auth-google-oauth: Google OAuth 인증 게이트 + PR #1 잔여 cleanup

> 작성: 2026-05-12  /  작성자: Lead 에이전트
> 관련 작업: feature/auth-google-oauth

## 배경

PRD §3 V1 인증 슬라이스를 시작하면서 다음 세 갈래의 결정을 한 번에 잡아야 했다:
1. Supabase Auth 통합 방식 (Server Action vs 클라이언트, RSC SSR helper 채택)
2. test-writer가 spec을 잡으며 올린 Lead 판단 요청 6건 (경로·매처·SSR mock·env 등)
3. PR #1 사용자 종합 리뷰가 남긴 후속 정리 4건 (Button hover, pretendard, font-mono, shadcn deps)

이 슬라이스에서 위 결정을 모두 굳히고, 코드 cleanup도 본 작업에 묶어 처리한다.

## 결정

### A. Supabase Auth 통합 (디자이너 보고 + PRD §7 기반)
- **`@supabase/ssr` 패키지로 RSC SSR helper 채택** — Next.js 15 App Router 권장 패턴. 쿠키 기반 세션.
- **로그인 트리거는 Server Action 방식**. 디자이너가 `app/login/page.tsx`에 `<form action="#login-pending">`로 결합 지점만 잡아둠 → worker가 Server Action으로 교체 (`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` 호출).
- **callback handler**: `app/auth/callback/route.ts` (App Router route handler). code → session 교환 + `users` upsert + `/`로 redirect.
- **이미 로그인된 사용자가 `/login`에 진입**: Server Component 상단에서 `supabase.auth.getUser()` 후 user 있으면 `redirect('/')`.

### B. 데이터 모델 (PRD §4 그대로)
- **`users` drizzle 스키마 경로**: `db/schema/users.ts` (named export `users`). test-writer spec이 `@/db/schema/users` 경로로 import한다.
- 필드: `id UUID PK, email text notNull, google_id text, created_at timestamp notNull`. Supabase Auth `auth.users.id`를 그대로 PK로 사용 (트리거 없이 callback handler에서 upsert).
- **RLS는 다음 슬라이스(friends-crud)부터 본격 정의**. 이번 슬라이스 `users` 테이블은 callback에서만 쓰여 RLS off로 두되, service role key로 접근하는 패턴을 강제한다.
- **이번 슬라이스 unique 제약 미설정 의도** (sfx 🟡 권고 반영):
  - `email`·`google_id` 컬럼에 unique 제약을 두지 않는다. 정상 흐름은 `id` PK + `onConflictDoNothing()` 만으로 중복 방지 충분.
  - 엣지 케이스 (Supabase 콘솔에서 user 삭제 후 같은 Google 계정으로 재가입): 새 `id` + 같은 `email`/`google_id` row 가 추가될 수 있음 — V1 단일 사용자 토이 단계에서 발생 빈도 낮고, unique 제약은 friends-crud 슬라이스의 RLS·FK 정책과 함께 결정하는 게 자연스러움 (§J 로 deferred).
- **provider · email 가정** (sfx 🟡 권고 반영):
  - V1 은 Google provider 전용 (Supabase 콘솔에서 Google 만 활성화). callback 에서 `app_metadata.provider !== "google"` 일 때 `?error=unsupported_provider` 로 가드 — 향후 Apple/Email provider 추가 시 가시화.
  - Google OAuth `email` scope 가 email 을 보장하지만, notNull 컬럼 무결성을 위해 `!user.email` 일 때 `?error=missing_email` 가드를 추가 (도달 불가 경로지만 방어 코딩).

### C. 보호 라우트 매처 (test-writer 요청)
- **`shouldProtect(pathname)` 순수 함수를 `lib/auth/matcher.ts`에 분리** (named export). middleware는 이 함수를 호출만 한다 → 단위 테스트 가능.
- 보호 대상: `/`, `/friends`, `/friends/*`, `/entries`, `/settings`, 그 외 도메인 라우트 전부
- 통과 대상: `/login`, `/auth/*`, `/api/auth/*`, `/_next/*`, `/favicon.ico`, 정적 자산

### D. E2E 인증 fixture (test-writer 요청 4)
- **`E2E_BYPASS_AUTH=1` 환경변수 도입**. `NODE_ENV !== 'production'` 가드와 AND로 결합 — 프로덕션에선 절대 작동하지 않음.
- fixture(`e2e/fixtures/auth.ts`)가 mock Supabase 쿠키를 심으면, 서버측 supabase 클라이언트가 `E2E_BYPASS_AUTH=1`일 때만 쿠키 페이로드를 그대로 신뢰하는 경로를 사용한다.
- 프로덕션 빌드에서는 이 우회 경로가 dead code로 빠지도록 `process.env.NODE_ENV !== 'production'` 가드를 코드 단에 명시.

### E. 환경 변수 (test-writer 요청 5)
- **`playwright.config.ts`의 `webServer.env`에 placeholder 주입** — `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder`, `E2E_BYPASS_AUTH=1`. 실제 OAuth round-trip이 없는 E2E라 placeholder로 충분.
- `.env.example`은 이번 PR에서 갱신하지 않음. PR #1에 이미 키 5개 명시되어 있어 그대로 유지.

### F. 통합 테스트 범위 (Lead 결정)
- **이번 슬라이스에선 callback route handler 단위만 mock 기반 통합 테스트로 검증**.
- Supabase 로컬 인스턴스·실제 Postgres 라운드트립은 다음 슬라이스(friends-crud) 시작 시점에 인프라 결정 (Supabase CLI 로컬 vs pglite vs vitest with docker postgres 비교 결정 로그 별도 작성).

### G. Button 기본 variant hover (PR #1 사용자 리뷰 🟡)
- **radix-nova의 press translate affordance를 채택**. hover 색 변화 추가하지 않음.
- 디자이너가 `/login`에 박은 Google 로그인 버튼은 `variant="outline"` (hover 정상 동작). default variant는 첫 도메인 페이지(form 제출 액션 등)에서 실 사용되는 시점에 재평가.
- 결정 근거: nova preset은 의도된 디자인 언어를 가지며, hover를 임의 추가하면 디자인 시스템 일관성이 깨진다. 사용자가 "결정 로그에 명시"를 옵션으로 제시한 그대로 채택.

### H. PR #1 잔여 cleanup (🟢 3건, 이번 슬라이스에 통합)
1. `pretendard` npm 패키지 제거 (`package.json`에서 한 줄 삭제) — 폰트는 `app/fonts/PretendardVariable.woff2` + `next/font/local`로 충분
2. `shadcn` 패키지 → `devDependencies` 이동 — CLI 도구이며 `@import "shadcn/tailwind.css"`는 build-time CSS 처리라 dev deps에 있어도 Vercel 빌드 정상
3. `app/globals.css`의 `--font-mono: var(--font-geist-mono)` 한 줄 제거 — `--font-geist-mono`는 어디서도 선언 안 됨. V1에 mono 폰트 사용 예정 없음 (V2 코드 블록 표시 시점에 재도입)

### I. next.config 보안 헤더 (sfx 다음 라운드 권고 + PR #1 사용자 리뷰 💬)
- **`next.config.ts`에 `headers()` 추가**, 최소 셋:
  - `X-Frame-Options: DENY` (clickjacking 방지)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - CSP는 이번 슬라이스에서 보류 (Supabase·Vercel·next/script의 정확한 origin 확정 후 friends-crud 슬라이스에 추가) — 결정 로그에 deferral 명시

### J. 마이그레이션 deferred
- **Playwright CI 빌드 모드 분기** (`next build && next start` for CI): 다음 슬라이스(friends-crud)에서 실제 GitHub Actions 셋업 시점에 결정
- **`next lint` → `eslint .` 마이그레이션**: V1 마무리 직전 단발 `/meta` 슬라이스로 분리. eslint flat config 마이그레이션이 함께 필요해 별도 슬라이스가 깔끔
- **`users.email` / `users.google_id` unique 제약 추가**: friends-crud 슬라이스에서 RLS 정책 + `friends.user_id` FK 정합성 검증과 함께 결정. 단독 PR 가치 낮음.
- **dynamic import 환원 검토** (`app/auth/callback/route.ts` 의 `@/db/client` · `@/db/schema/users`): 현재 vi.mock factory hoisting 한계 회피용. friends-crud 슬라이스에서 통합 테스트 인프라(Supabase 로컬 / pglite / docker postgres) 결정 시 static import 환원 가능성 재검토.

## 근거

- **Server Action 결합**: Next.js 15 RSC에서 가장 자연스러운 패턴. 클라이언트 핸들러는 OAuth provider 호출 시 sb 관련 쿠키 처리가 복잡해짐.
- **`shouldProtect` 순수 함수 분리**: middleware는 Edge 런타임이라 디버깅·테스트 어려움 → 의사결정 로직만 추출하면 jsdom에서 검증 가능.
- **`E2E_BYPASS_AUTH` 가드**: 토이 단계에서 실제 OAuth round-trip을 E2E로 검증하는 비용이 매우 큼 (Google OAuth consent screen 모킹은 별도 인프라). 가드를 두면 production 빌드에 새지 않음.
- **callback에서 users upsert**: Supabase Auth 트리거(Postgres function) 대안은 함수 관리 비용·디버깅 복잡도 큼. Application-layer upsert가 가시성·테스트 용이.
- **Button hover 보류**: PR #1 사용자 리뷰가 "의도일 수 있음"을 명시 → nova preset 의도 존중. 첫 도메인 페이지에서 어색하면 재논의.
- **cleanup 본 슬라이스 통합**: 별도 PR을 도는 비용이 4건 처리 비용보다 큼. 작은 변경이라 인증 본 작업과 한 PR에 묶어도 리뷰 부담 적음.

## 거절된 대안

- **(A) 클라이언트 사이드 OAuth 핸들러** — `"use client"` 컴포넌트에서 `supabase.auth.signInWithOAuth()` 직접 호출. RSC 패턴에서 벗어나며 쿠키 흐름 복잡. 거절.
- **(B) `users` 테이블 RLS off 영구 유지** — V1 단일 사용자라 RLS 없이 service role key로만 접근하는 패턴. 거절: friends/entries는 RLS 필수이고 같은 DB에 RLS on/off 혼재는 보안 사각지대 생성.
- **(C) middleware에서 직접 보호 라우트 정규식 매칭** — 의사결정 로직과 Edge 런타임 코드가 섞임. 단위 테스트 불가. 거절.
- **(D) 실제 Google OAuth E2E** — Playwright + Google consent 모킹 인프라 셋업. 토이 단계에 과함. 거절.
- **(E) Supabase auth trigger로 users 자동 시드** — Postgres function 관리 비용. 거절.
- **(F) Button hover 색 변화 즉시 추가** — nova preset 의도 깨짐 위험. 거절.
- **(G) PR #1 잔여 cleanup을 별도 `/meta` 슬라이스로 분리** — PR 한 번 도는 비용 > 4건 통합 비용. 거절.
- **(H) CSP를 이번 슬라이스에 포함** — Supabase·Vercel·next/script origin 확정 안 됨. friends-crud 슬라이스로 deferred. 거절.

## 사용자 개입 (선반영)

PR #1 머지 코멘트(https://github.com/wodn5515/boon/pull/1#issuecomment-4426633808)의 4건 권고를 이 결정 로그가 처리한다:
- 🟡 Button hover → §G (radix-nova press translate 채택, 결정 로그 명시)
- 🟢 pretendard → §H-1 (이번 PR cleanup)
- 🟢 --font-mono → §H-3 (이번 PR cleanup)
- 🟢 shadcn deps → §H-2 (이번 PR cleanup)
- 💬 보안 헤더 → §I (이번 PR 일부, CSP는 §J로 deferred)
- 💬 Playwright CI → §J (deferred to friends-crud)
- 💬 next lint → §J (deferred to V1 마무리 전 별도 `/meta`)

## peer 검증 후 보강 (sfx 🟡 / 🟢 권고 반영, append)

라운드 1 sfx 검증에서 🔴 0건, 🟡 3건, 🟢 3건. 머지 차단은 없었으나 다음을 본 PR 안에서 즉시 반영:

- **callback handler 가드 추가**: `provider !== "google"` → `?error=unsupported_provider`, `!user.email` → `?error=missing_email`. `?? ""` 폴백은 제거하여 notNull 무결성을 명시적 redirect 로 보호 (sfx 🟡 #1·#3).
- **`/login` error 쿼리 노출**: `searchParams.error` 를 매핑해 카드 안에 `role="alert"` 로 부드럽게 표시. 사일런트 fail 제거 (sfx 🟢 #1).
- **`lib/env.ts` 중복 헬퍼 제거**: 미사용 `isE2EAuthBypass()` 삭제. E2E 우회 가드는 `lib/auth/bypass.ts::isE2EBypassEnabled()` 단일 소스 (sfx 🟢 #2).

§B 본문에 unique 제약 미설정 의도 + provider/email 가정을 명시하고, unique 제약 추가는 §J 의 friends-crud deferred 로 묶음.

## 후속 영향

- **friends-crud 슬라이스 시작 시 필수 결정**:
  1. Supabase 로컬·통합 테스트 인프라 (CLI vs pglite vs docker postgres)
  2. `users` 테이블 RLS 정책 본격 정의 + `friends`/`categories`/`entries`의 RLS 패턴
  3. CSP 헤더 추가 (Supabase origins 확정 후)
  4. Playwright CI 빌드 모드 분기 결정
- **V1 마무리 직전 단발 `/meta`**: `next lint` → flat config 마이그레이션
- **README 동기화**: `/login` 라우트 추가 + `users` 데이터 모델 활성화 → worker가 README §주요 기능·사이트맵에 반영 (이미 PR #1 베이지/초록 톤·V1 인증 항목 명시되어 있어 큰 갱신은 없을 듯)
