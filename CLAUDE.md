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
- 테스트는 **선작성 → 빨갛게 실패 확인 → Lead 자율 채택(결정 로그 기록) → 구현으로 초록 전환** 순서.
- 단위 테스트 보강은 worker 구현 후 별도 라운드로 test-writer가 진행.
- 테스트를 통과시키기 위한 spec 약화는 worker가 임의로 못 한다 — Lead에 보고하고 Lead가 자율 판단.

테스트 도구 매핑:
| 레이어 | 도구 | 위치 |
|---|---|---|
| 단위 (함수, 유틸, 훅) | Vitest + RTL | `tests/unit/**/*.test.ts(x)` |
| 통합 (API route, DB 인접) | Vitest | `tests/integration/**/*.test.ts` |
| E2E (사용자 흐름) | Playwright | `e2e/tests/**/*.spec.ts` |

## 9. 워크플로우 분기 (코드 vs 메타)

작업 성격에 따라 두 흐름 중 하나로 진입한다:

| 변경 대상 | 스킬 | 흐름 |
|---|---|---|
| `app/**`, `components/**`, `lib/**`, `db/**`, 마이그레이션, drizzle 스키마 | **`/work`** | 워크트리 → 디자이너·TDD 게이트 → 팀 spawn → peer 검증 → PR |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**`, `.claude/**`, `.gitignore`, dev 도구 설정, CI 워크플로우 | **`/meta`** | 워크트리 → Lead 단독 작업 → PR (게이트·팀·peer 검증 생략) |
| 긴급 수정 (`main` 베이스) | **`/hotfix`** | stage 우회 |

판단 기준: **"이 변경이 사용자가 보는 화면·동작·데이터를 바꾸는가"** — 바꾸면 `/work`, 안 바꾸면 `/meta`. 애매하면 `/work`가 안전.

자세한 분기 표는 [`AGENTS.md`](./AGENTS.md) §6.

## 10. 브랜치 & 워크트리 전략

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

## 11. 환경 변수

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

## 12. 결정 로그 (decisions log) 운영

작업 중 발생하는 모든 비자명한 판단은 **Lead 에이전트가 자율적으로 결정**하고, 그 즉시 `docs/decisions/<NNN>-<slug>.md`로 기록한다. 사용자에게 매번 물어 승인을 받는 흐름이 아니다 — Lead는 PRD·결정 로그·CLAUDE.md를 근거로 스스로 판단할 권한과 책임을 동시에 가진다.

### 12-1. 무엇을 기록하는가
- **TDD 게이트에서 작성한 spec 시나리오** — 어떤 사용자 흐름을, 어떤 검증 포인트로 잡았는지
- **spec 약화/강화 판단** — worker가 통과시키기 어렵다고 보고했을 때 Lead가 spec 수정 결정을 내린 경우
- **디자이너 호출 여부와 그 결과** — 어떤 컴포넌트 골격을 어떤 톤으로 잡았는지
- **데이터 모델 변경, 마이그레이션 전략, validation 규칙, 알림 시점, 엣지 케이스 처리 방침**
- **거절된 대안** — 다른 선택지가 왜 채택되지 않았는지 (미래에 다시 논쟁이 붙는 걸 방지)

기록할 필요 없는 것:
- 단순 버그 수정, 명백한 오타·스타일 교정
- PRD/이전 결정 로그에 이미 명시된 사항을 단순 적용한 경우
- 코드 변경의 무엇/어떻게 (git diff와 PR 본문이 충분히 표현)

### 12-2. 파일 형식

```
docs/decisions/
├── PRD.md                       # 기존 컨셉 발굴 로그 (D-001~D-028)
├── 001-<slug>.md                # 새 작업의 첫 결정
├── 002-<slug>.md
└── ...
```

각 파일 템플릿:

```markdown
# <NNN>-<slug>: <한 줄 제목>

> 작성: <YYYY-MM-DD>  /  작성자: Lead 에이전트
> 관련 작업: <브랜치명 또는 PR 번호>

## 배경
<왜 이 결정이 필요했는지 — 마주친 문제, 모호한 지점, 트레이드오프>

## 결정
<무엇을 어떻게 하기로 했는지 — 1~3문장으로 명확히>

## 근거
<왜 그렇게 결정했는지 — PRD/이전 결정/실용성/기술 제약 등>

## 거절된 대안
- **(A) ...** — 거절 사유
- **(B) ...** — 거절 사유

## 후속 영향
<이 결정이 영향을 미치는 다른 영역 / V2 이후 재논의 필요성>
```

### 12-3. 사용자가 끼어들 때

사용자가 결정에 대해 직접 의견을 주면(예: "그렇게 말고 X로 해줘") 해당 결정 파일에 다음을 append한다:

```markdown
## 사용자 개입 (<YYYY-MM-DD>)
- 사용자 지시: <원문 그대로 인용>
- 변경된 결정: <어떻게 수정되었는지>
```

기존 "결정"을 통째로 덮어쓰지 않고 이력을 남긴다.

### 12-4. 작성 시점
결정이 발생한 **그 작업의 워크트리에서 그 작업의 커밋으로** 포함시킨다. 별도 PR로 분리하지 않는다. PR 본문에는 "관련 결정 로그: `docs/decisions/<NNN>-<slug>.md`" 한 줄로 링크.

## 13. 금지 사항 (요약)

- `main` / `stage` 직접 push
- force push, `git reset --hard`, `git merge` 직접 수행
- PR 머지 (사용자가 수행)
- 머지된 브랜치에 추가 push
- 열린 PR이 있는데 같은 주제로 새 PR 생성
- worker가 테스트 파일(`tests/**`, `e2e/**`) 수정
- test-writer가 구현 파일(`app/**`, `components/**`, `lib/**` 등) 수정
- peer 검증(lint·sfx) 생략하고 PR 생성
- AWS MCP 호출 시 `--profile read-only` 누락 (훅이 차단)
- **비자명한 결정을 내리고도 `docs/decisions/<NNN>-<slug>.md`를 남기지 않음**
- **사용자 가시 기능·스택·사이트맵·데이터 모델이 바뀌었는데 `README.md` 미동기화**

## 14. 참고 문서

- [`README.md`](./README.md) — 서비스 소개
- [`docs/PRD.md`](./docs/PRD.md) — 제품 스펙 (V1 범위, 데이터 모델, UX, DoD)
- [`docs/decisions/PRD.md`](./docs/decisions/PRD.md) — 초기 결정 로그 (D-001 ~ D-028)
- [`docs/decisions/<NNN>-<slug>.md`](./docs/decisions/) — 작업별 결정 로그
- [`AGENTS.md`](./AGENTS.md) — 에이전트 운영 규칙
- [`.claude/skills/`](./.claude/skills/) — 슬래시 스킬 정의
- [`.claude/agents/`](./.claude/agents/) — 에이전트 정의
