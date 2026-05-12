# 002-bootstrap-nextjs-slice: 첫 코드 슬라이스 범위와 게이트 생략 결정

> 작성: 2026-05-12  /  작성자: Lead 에이전트
> 관련 작업: feature/bootstrap-nextjs-stack

## 배경

PRD V1 구현의 첫 코드 슬라이스를 시작하면서 다음 두 가지를 결정해야 했다:
1. 이 슬라이스에 무엇을 넣을 것인가 (범위)
2. `/work` 흐름의 디자이너 게이트·TDD 게이트를 적용할 것인가

## 결정

### 슬라이스 범위
**부트스트랩 인프라 + 디자인 토큰 + placeholder 페이지** 만 포함한다.

포함:
- Next.js 15 (App Router) + TypeScript 프로젝트 초기화
- Tailwind CSS + shadcn/ui CLI 셋업, 기본 컴포넌트 몇 개 (`button`, `card`, `dialog` 정도)
- Pretendard 폰트 적용 (`app/layout.tsx`)
- 디자인 토큰 → `app/globals.css` (PRD §6 그대로: 베이지 #FAF7F0, 초록 #22C55E, 라임 #84CC16, 연두 #4ADE80 등)
- 테스트 도구 셋업: `vitest.config.ts` + `playwright.config.ts` (실제 spec 파일은 0)
- `package.json` scripts: `dev`, `build`, `start`, `test`, `test:e2e`, `lint`, `typecheck`
- 빈 디렉토리 구조: `app/`, `components/ui/`, `lib/`, `db/`, `tests/{unit,integration}/`, `e2e/{tests,fixtures}/`
- `.env.example` (PRD §8 환경 변수 키 명시, 값은 빈 칸)
- 루트 placeholder `app/page.tsx`, `app/layout.tsx`
- `.gitignore`는 이미 존재 — 필요 항목 보강만

제외 (다음 슬라이스):
- Supabase 클라이언트 셋업 (인증 슬라이스에서)
- Drizzle 스키마·마이그레이션 (인증 슬라이스에서 `users` 먼저)
- 실제 도메인 페이지(`/login`, `/friends`, `/entries`, `/settings`)
- 실제 spec 파일 (test-writer 영역)

### 디자이너 게이트 생략
**사유**: 이번 슬라이스는 PRD §6과 결정 로그 D-019~D-022에서 이미 디자인 톤이 모두 결정되었다 (베이지/크림 + 초록·연두, shadcn + Tailwind + Pretendard). worker가 그 사양을 그대로 적용하면 되는 boilerplate 수준이라 designer 단발 호출의 가치(시각적 판단·후보 비교)가 거의 없다.

다음 디자이너 호출 시점: 메인 대시보드 위젯 5종 신규 구현 슬라이스 (PRD §3 — 신세 리스트·친구 카드 그리드·다가오는 생일·이번 달 요약·FAB).

### TDD 게이트 생략
**사유**: 작업 성격표(`AGENTS.md` §5-2)의 "infra/CI 설정 단독 → 불필요" 카테고리에 95% 해당. 테스트 도구(`vitest.config`, `playwright.config`) 자체를 셋업하는 단계라 "현재 코드 기준 빨강 실패"의 의미가 약함 — npm·next·vitest가 아직 없어서 실행 자체가 불가.

대신 worker가 셋업 후 다음을 직접 검증:
- `npm run dev` → 200 OK + Boon 텍스트 노출 (브라우저 수동 확인 또는 curl)
- `npm run build` → 빌드 통과
- `npm run typecheck` → 통과
- `npm test`, `npm run test:e2e` → 0 tests pass (config가 잘 잡혔는지만)

다음 슬라이스(인증)부터 본격 TDD 게이트 적용. 인증은 사용자 행동 흐름·세션 게이트라 `AGENTS.md` §5-2 표상 필수 케이스.

### 테스트 도구 설정 파일 권한 명확화
`vitest.config.ts`, `playwright.config.ts`는 **worker가 작성·수정 가능**한 영역으로 본다. 정책상 "테스트 파일"은 `tests/**`, `e2e/**` 안의 실제 spec(*.test.ts, *.spec.ts)이고, 설정 파일은 인프라 영역이다. 다음 슬라이스부터 설정 변경이 자주 일어나지는 않을 것.

## 근거

- **점진적 슬라이스**: 한 PR에 모든 V1 기능을 넣으면 거대해지고 리뷰 어려움. 가장 작은 의미 단위(빌드 가능한 빈 셸)부터 시작해 도메인 코드를 점진 추가.
- **게이트 비용**: 게이트는 결정 비용 + 호출 비용이 있다. 결정이 자명하고 검증할 동작이 없는 단계에 게이트를 강제하면 마찰만 늘어남.
- **다음 슬라이스 명확**: 인증부터 본격 게이트 적용이라 정책 일관성은 유지.

## 거절된 대안

- **(A) 한 PR에 V1 전체** — 거대 PR, 리뷰·롤백 불가능. 거절.
- **(B) 첫 슬라이스에 인증까지 포함** — 부트스트랩 + Supabase 클라이언트 + drizzle + Google OAuth + 첫 사용자 흐름이 한 묶음. 의존 항목이 너무 많아 한 PR로 검증·리뷰 어려움. 거절.
- **(C) `/meta`로 진행** — 인프라 셋업이라 메타 흐름도 가능하지만, `app/page.tsx` 등 코드 영역에 첫 파일들이 들어가고 다음 슬라이스부터 즉시 worker가 그 위에서 작업하므로 `/work`가 흐름상 자연스러움. 또 첫 정상 `/work` 사용 사례를 만드는 의미도 있음. 거절.
- **(D) 디자이너 호출** — 톤·컴포넌트가 PRD에 다 명시되어 있어 추가 결정 거의 없음. 다음 슬라이스(위젯 신규)에서 호출하는 게 결정 가치 높음. 거절.

## 후속 영향

- 슬라이스 순서(자율 판단, 변경될 수 있음):
  1. **bootstrap-nextjs-stack** (이번 슬라이스)
  2. auth-google-oauth — Supabase + drizzle + `users` 테이블 + `/login` + 보호 라우트
  3. friends-crud — `friends` 테이블 + `/friends` 목록·상세 + 추가/수정/삭제 모달
  4. categories-crud — `categories` 테이블 + 기본 3개 시드 + 사용자 추가 + `/settings`
  5. entries-crud — `entries` 테이블 + 신세 추가/수정/삭제 모달 + 친구 combobox
  6. dashboard-widgets (디자이너 호출) — 메인 대시보드 위젯 5종
  7. entries-list — `/entries` 검색·필터·날짜 범위
  8. excel-import — 컬럼 매핑·매칭·일괄 import
  9. friend-detail — `/friends/[id]` 타임라인·통계·생일 D-N
- 다음 슬라이스(auth-google-oauth)부터 TDD 게이트·디자이너 게이트 모두 정상 적용.
