# CLAUDE.md — Boon 프로젝트 컨텍스트

> 이 파일은 Claude Code(및 AGENTS.md 호환 도구)에 **프로젝트 컨텍스트**를 제공한다.
> 에이전트 운영 규칙(누가, 어떤 순서로, 어떻게 협업하는지)은 [`AGENTS.md`](./AGENTS.md)를 참고한다.

---

## 1. 프로젝트 한 줄 요약

**Boon (분)** — 친구한테 받은 신세를 기록하는 1인용 인간관계 회상 노트.
🇬🇧 Boon (은혜) + 🇰🇷 분 (바람이 분다). "받은 마음이 바람처럼 분다".

전체 스펙은 [`docs/PRD.md`](./docs/PRD.md), 결정 로그는 [`docs/decisions/PRD.md`](./docs/decisions/PRD.md).

## 2. 핵심 가치 & 톤

- **본인용 비밀 노트** — 사용자별 격리, 공유·소셜 ❌
- **부채 트래커가 아니라 회상 노트** — "갚아야 한다" 강박 톤 ❌, 부드러운 환기 ⭕
- **항목 단위 기록** — 점수·카운트 합산 ❌, 한 사건 = 한 엔트리
- **운영 비용 $0** — Vercel Hobby + Supabase Free 슬롯
- **AI 런타임 미사용** — 개발에는 AI 사용, 서비스에는 LLM 호출 없음

Non-goal (의도적 제외, V1):
- 부채/잔고/점수 시스템
- 사용자 간 공유 / 소셜
- 베푼 신세 트래킹 (V2)
- 알림 (푸시/이메일)
- 다크 모드 (V2)

## 3. 기술 스택

| 항목 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| 폰트 | Pretendard |
| Auth + DB | Supabase (Postgres + Auth) |
| ORM | Drizzle |
| 차트 | Recharts (shadcn charts) |
| 엑셀 파싱 | SheetJS (xlsx) |
| **단위/통합 테스트** | **Vitest + React Testing Library** |
| **E2E 테스트** | **Playwright** |
| 배포 | Vercel Hobby |

선택 근거는 PRD §7과 결정 로그 D-023, D-024 참고.

## 4. 디렉토리 구조 (예정)

```
boon/
├── .claude/             # Claude Code 설정 (에이전트, 스킬, 훅)
├── docs/
│   ├── PRD.md           # 제품 스펙
│   └── decisions/       # 결정 로그
├── app/                 # Next.js App Router 페이지
├── components/
│   ├── ui/              # shadcn 컴포넌트
│   └── ...              # 도메인 컴포넌트
├── lib/                 # 유틸, supabase 클라이언트, drizzle 스키마
├── db/                  # drizzle 마이그레이션
├── public/
├── tests/
│   ├── unit/            # Vitest 단위 테스트 (*.test.ts/tsx)
│   └── integration/     # Vitest 통합 테스트
├── e2e/
│   ├── tests/           # Playwright spec (*.spec.ts)
│   ├── fixtures/        # 인증 storageState, 시드
│   └── playwright.config.ts
├── CLAUDE.md            # 이 파일
└── AGENTS.md            # 에이전트 운영 규칙
```

> 코드는 아직 비어 있다 — 위 구조는 첫 구현 시 따라야 할 합의된 형태다.

## 5. 디자인 시스템

PRD §6 기준. 베이지/크림 + 초록/연두 톤. 회상 노트 + 자연/식물 메타포.

```css
:root {
  --background: #FAF7F0;        /* 베이스 (크림) */
  --card: #FFFFFF;              /* 카드 */
  --brand-primary: #22C55E;     /* 초록 메인 */
  --brand-lime: #84CC16;        /* 라임 */
  --brand-light: #4ADE80;       /* 연두 */
  --foreground: #1F2937;        /* 텍스트 */
  --muted: #78716C;             /* 그레이 (스톤) */

  --cat-material: #22C55E;      /* 물질 - 초록 */
  --cat-time: #84CC16;          /* 시간·행동 - 라임 */
  --cat-mind: #4ADE80;          /* 마음 - 연두 */
}
```

반응형 브레이크포인트:
- 모바일 `< 640px` — 하단 탭 네비, 위젯 세로 적층
- 태블릿 `640–1024px` — 상단 네비, 위젯 2열
- 데스크톱 `≥ 1024px` — 사이드바 네비, 위젯 2~3열

이니셜 아바타: 이름 첫 글자(한국어 1자/영어 2자), 배경색은 이름 해시 기반(초록 계열 HSL 풀).

## 6. 데이터 모델

PRD §4 기준 4개 엔티티: `users` / `friends` / `categories` / `entries`.
- 사용자별 격리는 Supabase RLS로 강제
- 친구는 soft delete (`is_deleted`), 신세는 hard delete
- 기본 카테고리 3개(💰물질/⏰시간·행동/💝마음)는 가입 시 자동 생성, 삭제 불가
- `entries.repayment_timing` enum: `anytime` / `friend_birthday` / `specific_event` / `specific_date`

## 7. 코딩 컨벤션

- **TypeScript strict** — `any` 자제, 미해결 타입 에러로 커밋 금지
- **컴포넌트 네이밍** — PascalCase, 파일명 동일
- **유틸 함수** — camelCase
- **DB 컬럼/엔트리 필드** — snake_case (PRD 스펙 그대로)
- **주석은 한국어로** (코드/스킬/PR 모두 한국어 기조)
- **커밋 메시지 = 한국어**, 템플릿:
  ```
  [타입] 제목

  - 변경사항 1
  - 변경사항 2
  ```
  타입: `feat` / `fix` / `hotfix` / `refactor` / `infra` / `docs` / `chore`

## 8. 테스트 정책 (중요)

**테스트 코드와 구현 코드는 서로 다른 에이전트가 작성한다** — 자세한 흐름은 [`AGENTS.md`](./AGENTS.md) §"테스트와 구현의 분리" 참고. 여기서는 원칙만:

- **`test-writer` 에이전트**가 모든 테스트 파일(`tests/**`, `e2e/**`)을 작성·수정한다.
- **`worker` 에이전트**는 구현 코드만 다룬다. 테스트 파일은 **읽기만 가능**하고 **수정 금지**.
- 테스트는 **선작성 → 빨갛게 실패 확인 → 사용자 승인 → 구현으로 초록 전환** 순서.
- 단위 테스트 보강은 worker 구현 후 별도 라운드로 test-writer가 진행.
- 테스트를 통과시키기 위한 spec 약화는 사용자 합의 없이는 금지.

테스트 도구 매핑:
| 레이어 | 도구 | 위치 |
|---|---|---|
| 단위 (함수, 유틸, 훅) | Vitest + RTL | `tests/unit/**/*.test.ts(x)` |
| 통합 (API route, DB 인접) | Vitest | `tests/integration/**/*.test.ts` |
| E2E (사용자 흐름) | Playwright | `e2e/tests/**/*.spec.ts` |

## 9. 브랜치 & 워크트리 전략

| 패턴 | 베이스 | 머지 대상 |
|---|---|---|
| `feature/<slug>` | `origin/stage` | `stage` |
| `hotfix/<slug>` | `origin/main` (또는 `master`) | `main` |
| `sync/main-to-stage` | `stage` | `stage` (merge commit으로 main 반영) |

- 모든 작업은 `.worktrees/feature-<slug>` 또는 `.worktrees/hotfix-<slug>`에서 진행
- `main` / `stage`에 **직접 push 금지** (훅이 차단)
- **force push 금지** (`--force`, `-f`, `+refs/*` 모두)
- `git reset --hard`, `git merge` 직접 수행 금지
- PR 머지는 **사용자만** 수행

## 10. 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # 서버 작업용
DATABASE_URL=                   # Drizzle 직접 연결 (Postgres URL)
NEXT_PUBLIC_APP_URL=            # OAuth redirect
```

Supabase 콘솔에서 별도 설정:
- Authentication > Providers > Google On
- Google Cloud Console에서 OAuth Client ID/Secret 발급 → Supabase 입력
- Redirect URL: `https://<your-app>.vercel.app/auth/callback`

## 11. 금지 사항 (요약)

- `main` / `stage` 직접 push
- force push, `git reset --hard`, `git merge` 직접 수행
- PR 머지 (사용자가 수행)
- 머지된 브랜치에 추가 push
- 열린 PR이 있는데 같은 주제로 새 PR 생성
- worker가 테스트 파일(`tests/**`, `e2e/**`) 수정
- test-writer가 구현 파일(`app/**`, `components/**`, `lib/**` 등) 수정
- peer 검증(lint·sfx) 생략하고 PR 생성
- AWS MCP 호출 시 `--profile read-only` 누락 (훅이 차단)

## 12. 참고 문서

- [`docs/PRD.md`](./docs/PRD.md) — 제품 스펙 (V1 범위, 데이터 모델, UX, DoD)
- [`docs/decisions/PRD.md`](./docs/decisions/PRD.md) — 결정 로그 (D-001 ~ D-028)
- [`AGENTS.md`](./AGENTS.md) — 에이전트 운영 규칙
- [`.claude/skills/`](./.claude/skills/) — 슬래시 스킬 정의
- [`.claude/agents/`](./.claude/agents/) — 에이전트 정의
