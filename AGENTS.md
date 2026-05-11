# AGENTS.md — Boon 에이전트 운영 규칙

> 이 파일은 OpenAI가 제안하고 Claude Code/Cursor 등이 호환 읽는 **에이전트 협업 표준 문서**다.
> 프로젝트 컨텍스트(컨셉/스택/데이터 모델/디자인)는 [`CLAUDE.md`](./CLAUDE.md)에 있다.
> 사람이 읽기 위한 게 아니라 **에이전트가 작업 시작 전 반드시 참조**하기 위한 운영 매뉴얼이다.

---

## 1. 에이전트 목록

| 이름 | 역할 | 모델 | 테스트 파일 권한 | 구현 파일 권한 |
|---|---|---|---|---|
| **`worker`** | 구현 코드 작성 (feature/bugfix/refactor) | inherit | **읽기 전용** | 읽기·쓰기 |
| **`test-writer`** | 모든 레이어 테스트 작성 (단위/통합/E2E) | inherit | 읽기·쓰기 | **읽기 전용** |
| `lint` (`lint-checker`) | 린트·포매팅·스타일 검사 | haiku | 읽기 전용 | 읽기 전용 |
| `sfx` (`side-effect-checker`) | 사이드이펙트·로직·보안 검사 | inherit | 읽기 전용 | 읽기 전용 |
| `designer` | UI/UX 디자인 시스템·shadcn 커스터마이즈·UI 컴포넌트 골격 — **§4-4 조건 시에만 단발 호출** | inherit | 읽기 전용 | 읽기·쓰기 (UI 영역만) |
| `reviewer` | PR 코드 리뷰 (별도 세션) | inherit | 읽기 전용 | 읽기 전용 |

권한은 시스템 강제가 아닌 **운영 규약**이다. 어겼을 때 peer 검증 단계에서 차단되도록 lint/sfx에 검사 규칙을 추가해두었다.

## 2. 테스트와 구현의 분리 (핵심 원칙)

Boon의 협업 모델은 **TDD 선작성 + 에이전트 분리**다.

### 2-1. 분리 원칙
- **`test-writer`는 테스트 파일만 다룬다** — `tests/**`, `e2e/**`만 쓰기. `app/**`, `components/**`, `lib/**`, `db/**` 등 구현 파일은 **읽기만**.
- **`worker`는 구현 파일만 다룬다** — `tests/**`, `e2e/**`는 **읽기만**. 테스트 spec을 통과시키기 위해 테스트를 수정하는 것은 금지.
- 두 에이전트는 PR 안에서 **별개의 커밋**으로 작업한다 (commit 메시지로 식별: `[test]` prefix = test-writer, `[feat]`/`[fix]` 등 = worker).

### 2-2. 작업 라운드

```
[라운드 1] test-writer 선작성
  ├── E2E spec (Playwright, e2e/tests/)
  ├── 통합 테스트 (Vitest, tests/integration/)
  └── 단위 테스트 스켈레톤 (Vitest, tests/unit/) — 함수 시그니처/계약 기반
  ↓
  npm run test:e2e + npm run test  → 새 테스트 모두 빨갛게 실패해야 함
  ↓
[게이트] 사용자 승인 (spec 시나리오와 검증 포인트 확인)
  ↓
[라운드 2] worker 구현
  ├── 구현 코드 작성
  ├── 모든 선작성 테스트가 초록으로 통과
  └── peer 검증 (lint + sfx)
  ↓
[라운드 3] test-writer 단위 테스트 보강 (선택적)
  ├── worker 구현 구조를 보고 누락된 엣지 케이스/분기 커버리지 추가
  ├── 새 테스트도 빨갛게 실패 → worker가 보완 → 초록
  └── 커버리지 충분하면 생략
  ↓
[PR 생성] worker가 /pr 스킬로
```

### 2-3. 통과시키기 위한 spec 약화는 금지
worker가 구현 중 "이 spec은 너무 빡빡하다" 판단하더라도 spec을 직접 수정하지 않는다. Lead(메인 세션)에게 SendMessage로 합의 요청 → Lead가 사용자와 협의 → test-writer 단발 호출로 spec 수정 → worker 재진입.

### 2-4. 테스트 도구 매핑

| 레이어 | 도구 | 위치 | 명령 |
|---|---|---|---|
| 단위 | Vitest + RTL | `tests/unit/**/*.test.ts(x)` | `npm run test:unit` |
| 통합 | Vitest | `tests/integration/**/*.test.ts` | `npm run test:integration` |
| E2E | Playwright | `e2e/tests/**/*.spec.ts` | `npm run test:e2e` |
| 전체 | — | — | `npm test` |

## 3. 팀 모드 동작

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`이 `.claude/settings.local.json`에 켜져 있다.

### 3-1. 표준 팀 구성
Lead(메인 세션)가 `TeamCreate` 후 다음을 spawn:
- `worker` — 구현
- `lint` — 린트 검사
- `sfx` — 사이드이펙트 검사

`test-writer`는 **팀 멤버가 아니다**. Lead가 단발(`Agent` 호출 한 번)로 호출해 spec을 잡고 사용자 승인 후 종료한다.

### 3-2. 메시지 규약
- 팀 내 통신은 **`SendMessage(to: "<이름>")`** 으로만. UUID 사용 금지.
- 이름: `worker`, `lint`, `sfx`, `team-lead` (Lead 자기 자신)
- **plain text 출력은 다른 팀원에게 전달되지 않는다.** 반드시 `SendMessage` 호출.
- `summary`는 5~10단어, 본문엔 커밋 SHA·워크트리 경로·요점 포함.

### 3-3. peer 검증 흐름

worker가 구현 + 커밋 후:
1. `npm test` 직접 실행해 통과 확인 (선작성 spec 포함 회귀 없음)
2. 같은 턴에 lint·sfx에게 병렬 `SendMessage`로 검증 요청
3. 두 결과 모두 회신받을 때까지 idle
4. 🔴 must 이슈 있으면 수정 → 새 커밋 → 재검증
5. 🔴 모두 해소되면 `/pr` 스킬로 PR 생성

## 4. 표준 작업 흐름 (Lead 시점)

### 4-1. 작업 시작 — `/work <브랜치명>`

[`./.claude/skills/work/SKILL.md`](./.claude/skills/work/SKILL.md) 참고. 요약:

1. **연속성 확인** — `git worktree list`, `gh pr list --state all` 으로 같은 주제 PR/워크트리 있는지 확인. 있으면 그 위에서 이어가고 새로 만들지 않는다.
2. **워크트리 생성** — `origin/stage` 기반 `git worktree add -b feature/<slug> .worktrees/feature-<slug>`. gitignore 파일(`settings.local.json`)은 심링크.
3. **디자이너 게이트 (UI 비중이 큰 작업만)** — §4-4 조건 충족 시 `designer` 단발 호출 → UI 구현 커밋 → 종료.
4. **TDD 게이트** — 작업이 사용자 행동 흐름을 바꾸는 성격이면 `test-writer` 단발 호출 → 선작성 spec → 사용자 승인.
5. **팀 세팅** — `TeamCreate` 후 worker + lint + sfx 병렬 spawn.
6. **작업 진행** — worker가 구현(designer가 만든 UI 위에 데이터/로직 결합) → peer 검증 → `/pr`.
7. **리뷰 대기** — PR 생성 후에도 팀 유지. reviewer가 코멘트 달면 worker가 응대.
8. **머지 후 정리** — 사용자가 머지하면 `shutdown_request` → `TeamDelete` → `git worktree remove`.

### 4-2. TDD 선작성 강제 케이스

| 작업 성격 | test-writer 선호출 |
|---|---|
| 새 라우트 / 기존 라우트 동작 변경 | **필수** |
| 폼 제출·검증, 세션·인증·권한 게이트 | **필수** |
| 비즈니스 룰 (카테고리 이전, 친구 매칭, 보답 시점 알림 등) | **필수** |
| 사용자 진입 페이지/네비게이션 변경 | **필수** |
| 새 알림/뱃지/토스트 등 사용자 가시 상태 | **필수** |
| 데이터 모델 변경 (마이그레이션 포함) | **필수** (통합 테스트로 검증) |
| 순수 스타일 리뉴얼 (Tailwind 마이그레이션 등) | 선택 — 기존 smoke 회귀만 |
| 문구/카피, 정적 링크 텍스트 변경 | 불필요 |
| 내부 리팩토링 (외부 동작 동일) | 불필요 (기존 테스트가 회귀 방어) |
| 마이그레이션 단독, infra/CI 설정 | 불필요 |
| 문서·주석 변경 | 불필요 |

생략 시 Lead가 PR 본문에 "TDD 선작성 생략 — 사유: …" 한 줄로 명시.

### 4-3. test-writer 단발 호출 템플릿

```
Agent({
  subagent_type: "test-writer",
  description: "TDD 선작성 spec 작성",
  prompt: `
워크트리: <절대경로>
작업 주제: <한 줄 요약>
사용자 시나리오: <어떤 페이지에서 어떤 행동이 어떤 결과로>
인증 컨텍스트: <비로그인 / 인증된 사용자>
관련 데이터 모델: <users/friends/categories/entries 중 어느 것을 어떻게>
기존 관련 spec: <경로 또는 '없음'>

요구사항:
- 모든 레이어 테스트(E2E + 통합 + 단위 스켈레톤)를 현재 코드 기준 빨갛게 실패하도록 작성
- npm run test:e2e와 npm test 각각 새 파일만 지정해 실패 로그 확보
- 구현 코드(app/, components/, lib/, db/ 등)는 절대 수정하지 마라
- 보고 형식: spec 경로, 검증 포인트, 실패 로그 요약, 사용자 승인 요청
  `
})
```

`team_name` 없이 단발로 호출 (test-writer는 팀 멤버 아님).

### 4-4. 디자이너 게이트 (선택)

작업 성격이 UI 비중이 매우 큰 경우에만 Lead가 `designer`를 **단발로** 호출한다. 호출 조건:

| 작업 성격 | designer 단발 호출 |
|---|---|
| 디자인 시스템 초기 구축 (`tailwind.config`, `globals.css`, 디자인 토큰, shadcn 베이스) | **필수** |
| 메인 대시보드 위젯 신규 구현 (5개 위젯, 카드 그리드 등) | **필수** |
| 새로운 페이지 레이아웃 신설 (예: `/friends/[id]` 첫 구현) | **필수** |
| 모달 UX 신규 (신세 추가 모달, 엑셀 import 모달 등) | **필수** |
| 단순 데이터 페칭/CRUD 추가, 로직 변경 | 불필요 |
| 스타일 마이크로 조정 (간격, 색 한두 군데) | 불필요 |
| 마이그레이션, API 라우트 신규 | 불필요 |

호출 흐름:
1. Lead가 `Agent(subagent_type: "designer", ...)`로 단발 호출 (team_name·name 없음)
2. designer가 UI 컴포넌트 구현 + 커밋(`[ui]` prefix)
3. designer 종료 → Lead가 보고 받음
4. **이후 §4-1의 4단계(TDD 게이트)로 진입** — test-writer가 designer가 만든 UI 위에 E2E + 단위 렌더링 테스트 선작성
5. 팀 spawn → worker가 데이터 페칭·이벤트 핸들러·서버 액션 등 결합

designer는 **UI 구현만** 한다. 데이터 로직·테스트는 worker/test-writer가 후속 라운드에서 담당.

```
Agent({
  subagent_type: "designer",
  description: "Boon UI 디자인 시스템 구축",
  prompt: `
워크트리: <절대경로>
작업 주제: <한 줄 요약>
관련 PRD/결정: <PRD §6 / D-019~D-022>
구체 요청: <어떤 컴포넌트/페이지를, 어떤 디자인 토큰으로>

제약:
- 테스트 파일(tests/**, e2e/**), 데이터 모델(db/**, drizzle 스키마)은 절대 수정 마라
- shadcn/ui + Tailwind + Pretendard, 베이지(#FAF7F0) + 초록(#22C55E) 톤
- 반응형: 모바일 퍼스트, sm/lg 브레이크포인트
- 작업 완료 후 [ui] prefix로 커밋하고 보고 후 종료
  `
})
```

### 4-5. 팀 spawn 시 worker 프롬프트 필수 포함

```
- 워크트리 경로: <절대경로>
- 브랜치/베이스: feature/<slug> ← origin/stage
- 선작성된 spec: <e2e/tests/...spec.ts, tests/...test.ts 목록>
  → 이 모든 테스트를 통과시켜라.
  → spec 자체를 약화하지 마라 (필요 시 Lead에 합의 요청).
- 테스트 파일(tests/**, e2e/**)은 절대 수정하지 마라. 읽기만 허용.
- 구체적 요구사항·설계 결정·제약
- 작업 완료 시 npm test 통과 확인 → lint·sfx에 SendMessage로 peer 검증 요청
```

## 5. 슬래시 스킬 목록

| 스킬 | 시점 | 용도 |
|---|---|---|
| [`/work`](./.claude/skills/work/SKILL.md) | 새 기능 시작 | 워크트리 + TDD 게이트 + 팀 세팅 |
| [`/hotfix`](./.claude/skills/hotfix/SKILL.md) | 긴급 수정 | `main` 베이스 워크트리 |
| [`/pr`](./.claude/skills/pr/SKILL.md) | 구현 완료 후 | PR 생성 (템플릿 적용) |
| [`/review`](./.claude/skills/review/SKILL.md) | PR 리뷰 시 | reviewer가 GitHub 코멘트 |
| [`/sync`](./.claude/skills/sync/SKILL.md) | hotfix 머지 후 | `main → stage` 동기화 PR |
| [`/followup`](./.claude/skills/followup/SKILL.md) | PR 상태 점검 | OPEN(코멘트/컨플릭트), MERGED(정리), CLOSED 분기 처리 |
| [`/prd-interview`](./.claude/skills/prd-interview/SKILL.md) | 신규 기능 기획 | brownfield 인터뷰 → `docs/features/<slug>.md` |

## 6. PR 정책

- **base**: `feature/*` → `stage`, `hotfix/*` → `main`
- **제목**: 한국어, 70자 이내
- **본문 템플릿**:
  ```
  ## 요약
  왜 이 변경이 필요한지 한두 줄

  ## 변경사항
  - 변경 1
  - 변경 2

  ## 테스트
  - [test-writer] 선작성 spec: <경로>
  - [worker] 구현으로 초록 전환 확인
  - 단위/통합/E2E 전 레이어 통과: `npm test` 로그 첨부

  ## 영향 범위
  - 영향받는 기능/페이지
  - 사이드이펙트 여부

  ## 스크린샷
  (UI 변경 시)
  ```
- PR 머지는 **사용자만** 수행
- 머지 정책은 **Squash 머지**가 기본 (rebase·force push 금지)

## 7. 커뮤니케이션 규칙

- **Lead → worker** : `SendMessage(to: "worker")`. 코멘트 응대 시 우선순위(🔴/🟡/🟢) 포함
- **worker → lint/sfx** : 같은 턴에 병렬 호출. 본문엔 커밋 SHA + 워크트리 경로 + 변경 파일 목록
- **lint/sfx → worker** : 보고 형식 그대로 (`## 린트/포매팅 검사 결과` 또는 `## 사이드이펙트 검사 결과` 헤더)
- **worker → Lead** : PR 생성 후 완료 보고, 리뷰 라운드 완료 시마다 보고
- **Lead → 모두** : 머지 확인 후 `shutdown_request` JSON 메시지
- **shutdown_response(approve: true)** 회신 받은 뒤에만 `TeamDelete`

## 8. 금지 사항

### 8-1. 공통 (모든 에이전트)
- `main` / `stage` 직접 push
- force push (`--force`, `-f`, `+refs/*`)
- `git reset --hard`, `git merge` 직접 수행
- PR 머지 (사용자만)
- 머지된 브랜치에 추가 push
- 열린 PR이 있는데 같은 주제로 새 PR 생성
- AWS MCP 호출 시 `--profile read-only` 누락 (훅 차단)

### 8-2. worker 한정
- 테스트 파일(`tests/**`, `e2e/**`) 수정
- peer 검증(lint+sfx) 생략하고 PR 생성
- nested `Agent` 호출로 lint/sfx를 직접 spawn 시도 (팀 모델에선 peer가 이미 살아있음)
- PR 생성 직후 자기 종료 (Lead가 `shutdown_request` 보낼 때까지 idle 유지)

### 8-3. test-writer 한정
- 구현 파일(`app/**`, `components/**`, `lib/**`, `db/**` 등) 수정
- 통과해버리는 spec 작성 (작성한 spec은 현재 코드 기준 **반드시 빨갛게 실패**해야 함)
- 마이그레이션 작성·실행
- PR 생성·커밋 (Lead나 worker가 수행)

### 8-4. lint / sfx 한정
- 코드 수정 (보고만)
- 기존 코드의 문제 보고 (이번 변경분만 검사)
- 이전 결과 재사용 (재검증 요청 시 최신 커밋 기준으로 다시)

### 8-5. reviewer 한정
- 코드 수정 (`Edit`/`Write` 도구 비활성)
- PR 승인/머지 (사용자가 직접)

## 9. 훅 (자동 검증)

`.claude/hooks/` 디렉토리. `PreToolUse`로 동작.

- **`validate-git.sh`** — `git push` 명령을 검사해 `main`/`stage`/force push 차단. 오탐 줄이려고 substring 매칭이 아닌 정확한 토큰 분석으로 처리.
- **`validate-aws.sh`** — AWS MCP 호출 시 `--profile read-only` 누락 차단.

훅이 실패하면 명령은 실행되지 않는다. 메시지를 보고 명령을 조정해야 한다 — **훅을 우회·비활성하지 말 것**.

## 10. 트러블슈팅

| 상황 | 대응 |
|---|---|
| worker가 spec을 약화하고 싶어함 | Lead에 합의 요청 → 사용자 협의 → test-writer 단발 재호출로 spec 수정 |
| lint/sfx가 회신 안 옴 | 같은 메시지 재발송 말고 `TaskList`로 idle 여부 확인. spawn 실패 시 Lead가 재spawn |
| 머지 컨플릭트 | `/followup <PR번호>` → A-0-conflict 분기. **merge commit으로만 해소** (rebase 금지) |
| 워크트리에 settings 누락 | `ln -sf "$(pwd)/.claude/settings.local.json" ".worktrees/<dir>/.claude/settings.local.json"` |
| 테스트 환경 미기동 | docker compose / playwright install 등 환경 준비 후 재실행. Lead에 보고. test-writer가 직접 환경 셋업하지 않음 |
| PR 생성 후 reviewer 코멘트 도착 | Lead가 `/followup <PR번호>` 또는 `gh pr view --comments`로 정리해 worker에 SendMessage. worker는 idle에서 깨어나 응대 |

## 11. 참고

- [`CLAUDE.md`](./CLAUDE.md) — 프로젝트 컨텍스트 (컨셉, 스택, 데이터 모델, 디자인)
- [`docs/PRD.md`](./docs/PRD.md) — 제품 스펙
- [`docs/decisions/PRD.md`](./docs/decisions/PRD.md) — 결정 로그
- [`.claude/agents/`](./.claude/agents/) — 각 에이전트 정의 (worker, test-writer, lint-checker, side-effect-checker, designer, reviewer)
- [`.claude/skills/`](./.claude/skills/) — 슬래시 스킬 정의
