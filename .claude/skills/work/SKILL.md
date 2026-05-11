---
name: work
description: 새 기능 작업을 시작할 때 사용한다. 먼저 기존 워크트리와 PR 상태를 확인하여 이어서 작업할지 새로 시작할지 판단한 후, 필요하면 stage 브랜치 기반으로 worktree를 생성한다. 이후 Lead(메인 세션)가 팀을 만들고 worker·lint·sfx 팀원을 spawn한다.
argument-hint: "<브랜치명 또는 작업주제> [작업설명]"
---

# 작업 시작

## 1단계: 연속성 확인 (필수)

작업을 시작하기 전에 반드시 다음을 순서대로 확인한다.

### 기존 워크트리 확인
```!
git worktree list
```
```!
find .worktrees -maxdepth 1 -name 'feature-*' -o -name 'hotfix-*' 2>/dev/null
```

### 관련 PR 확인
```!
gh pr list --state all --limit 20
```

### 판단

| 상황 | 행동 |
|------|------|
| 같은 주제의 워크트리가 존재하고 PR이 **열려있음** | 해당 워크트리 경로를 안내. 새로 만들지 않음 |
| 같은 주제의 PR이 **머지됨** + 워크트리 존재 | 워크트리 정리(`git worktree remove`) 후 새 워크트리 생성 |
| 같은 주제의 PR이 **머지됨** + 워크트리 없음 | 후속 작업이면 새 워크트리 생성 (브랜치명 변경) |
| 같은 주제의 PR이 **닫힘** | 사유 확인 후 새 워크트리/브랜치로 재작업 |
| 관련 워크트리/PR 없음 | 새 워크트리 생성 |

## 2단계: 워크트리 생성 (새 작업인 경우)

```!
git fetch origin
```

```bash
mkdir -p .worktrees
git worktree add -b feature/$0 .worktrees/feature-$0 origin/stage
```

### gitignore 파일 심링크 (필수)
워크트리에는 gitignore 대상 파일(settings.local.json, settings.py)이 없으므로 원본 레포에서 심링크한다.
주의: `.claude` 디렉토리 전체를 심링크하면 git이 tracked 파일 삭제로 인식하므로, gitignored 파일만 개별 심링크한다.

```bash
mkdir -p ".worktrees/feature-$0/.claude"
# settings.local.json 심링크 (권한 설정)
ln -sf "$(pwd)/.claude/settings.local.json" ".worktrees/feature-$0/.claude/settings.local.json"
# settings.py가 있으면 심링크
[ -f settings.py ] && ln -sf "$(pwd)/settings.py" ".worktrees/feature-$0/settings.py"
```

## 2.4단계: 디자이너 게이트 (UI 비중이 큰 작업이면 단발 호출)

작업 성격이 다음 중 하나면 Lead가 **TDD 게이트보다 먼저** `designer`를 단발 호출한다 ([`AGENTS.md`](../../../AGENTS.md) §4-4 참고):
- 디자인 시스템 초기 구축 (tailwind.config, globals.css, 디자인 토큰, shadcn 베이스)
- 메인 대시보드 위젯 5종 신규
- 새 페이지 레이아웃 신설
- 모달 UX 신규

```
Agent({
  subagent_type: "designer",
  description: "Boon UI 골격 구현",
  prompt: "워크트리: <절대경로>\n작업 주제: <한 줄>\n관련 PRD/결정: <PRD §6 / D-019~D-022>\n구체 요청: <어떤 컴포넌트/페이지를>\n\n제약: 테스트 파일·데이터 모델 수정 금지. shadcn + Tailwind + Pretendard, 베이지/초록 톤. 모바일 퍼스트 반응형. [ui] prefix로 커밋하고 보고 후 종료."
})
```

team_name·name 없이 단발 호출. 사용자 승인 게이트는 디자인 변경이 크면 적용한다 (사용자 판단). 그 외 단순 작업은 이 단계를 건너뛰고 2.5단계로 직행.

## 2.5단계: TDD 게이트 (사용자 행동 흐름이 바뀌는 작업이면 필수)

팀을 spawn하기 **전에** Lead가 작업 성격을 판단하고 필요 시 `test-writer`를 단발로 호출해
실패하는 E2E spec을 먼저 잡는다. 사용자 승인을 받은 후에야 3단계 팀 세팅으로 넘어간다.

### 작업 성격 판단

| 작업 성격 | test-writer 선호출 |
|-----------|---------------------|
| 새 라우트 / 기존 라우트 동작 변경 | **필수** |
| 폼 제출·검증, 세션·인증·권한 게이트 | **필수** |
| 결제·발신 한도·찜·상담 등 비즈니스 룰 | **필수** |
| 사용자 진입 페이지/네비게이션 변경 | **필수** |
| 새 알림/뱃지/토스트 등 사용자 가시 상태 | **필수** |
| 순수 스타일 리뉴얼 (Tailwind 마이그레이션 등) | 선택 — 기존 smoke가 통과하는지만 확인 |
| 문구/카피, 정적 링크 텍스트 변경 | 불필요 |
| 내부 리팩토링 (외부 동작 동일) | 불필요 |
| 마이그레이션 단독, infra/CI 설정 | 불필요 |
| 문서·주석 변경 | 불필요 |

생략한 경우 Lead가 한 줄로 사유를 명시하고 3단계로 넘어간다 (예: "TDD 선작성 생략 — 사유: 스타일 리뉴얼만").

### test-writer 단발 호출 (필수 케이스)

```
Agent({
  subagent_type: "test-writer",
  description: "TDD 선작성 spec 작성",
  prompt: "워크트리: <절대경로>\n작업 주제: <한 줄 요약>\n사용자 시나리오: <어떤 페이지에서, 어떤 행동이, 어떤 결과로>\n인증 컨텍스트: <비로그인/학생/선생님>\n기존 관련 spec: <경로 또는 '없음'>\n\n현재 코드 기준 빨갛게 실패하는 spec을 작성하고 npm run test:e2e -- <새 spec>으로 실패를 확인한 뒤 보고해라. 구현은 절대 손대지 마라."
})
```

team_name·name 없이 단발로 호출한다 (test-writer는 팀 멤버가 아니라 일회성 도우미).

### 사용자 승인 게이트

test-writer가 spec과 실패 로그를 보고하면 **반드시 사용자에게 spec을 제시하고 승인을 받는다**.
- "진행" 답변이면 3단계 팀 세팅으로 넘어간다
- 시나리오 수정 요청이면 test-writer를 다시 호출해 spec을 갱신
- 승인 전에 절대 팀을 spawn하지 않는다

### 3단계 팀 spawn 시 worker 프롬프트에 포함할 사항 (TDD 게이트를 통과한 경우)

worker spawn 프롬프트의 요구사항 섹션에 다음을 명시한다:
- "선작성된 spec: `e2e/tests/<경로>.spec.ts` — 이 spec을 통과시키는 게 작업 목표"
- "통과를 위해 spec 자체를 약화시키지 마라. 약화가 필요하면 Lead에게 합의 요청"

## 3단계: 팀 세팅 (Lead = 메인 세션이 수행)

워크트리가 준비되면 **Lead가** 다음을 이 순서대로 실행한다.
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`은 `.claude/settings.local.json`에 이미 켜져 있다.

### 3-1. 팀 생성

```
TeamCreate({
  team_name: "feat-<브랜치명의 일부>",
  description: "<이 작업 한 줄 설명>"
})
```

### 3-2. 팀원 3명 병렬 spawn (한 메시지에 세 Agent 호출)

```
Agent({
  subagent_type: "worker",
  team_name: "feat-...",
  name: "worker",
  prompt: "작업 프롬프트. 반드시 포함:\n- 워크트리 경로: /Users/.../.worktrees/feature-<브랜치명>\n- 브랜치/베이스 정보\n- 구체적 요구사항·설계 결정·제약\n- 작업 완료 시 lint와 sfx에게 SendMessage로 검증 요청하라는 명시"
})

Agent({
  subagent_type: "lint-checker",
  team_name: "feat-...",
  name: "lint",
  prompt: "팀원으로 대기. worker가 SendMessage로 검증을 요청하면 .claude/agents/lint-checker.md의 절차대로 검사하고 결과를 worker에게 SendMessage로 회신. 대기 중에는 아무 작업도 하지 말 것."
})

Agent({
  subagent_type: "side-effect-checker",
  team_name: "feat-...",
  name: "sfx",
  prompt: "팀원으로 대기. worker가 SendMessage로 검증을 요청하면 .claude/agents/side-effect-checker.md의 절차대로 검사하고 결과를 worker에게 SendMessage로 회신. 대기 중에는 아무 작업도 하지 말 것."
})
```

### 3-3. 작업 진행 (PR 생성까지)

worker가 PR 생성 보고를 Lead에게 SendMessage로 보낼 때까지 대기.
중간에 사용자가 추가 지시를 주면 Lead가 `SendMessage(to: "worker", ...)`로 전달.

### 3-4. 리뷰 대기 (팀 유지)

worker가 PR 생성 보고를 보내면:
- **팀을 종료하지 않는다.** 별도 세션의 `reviewer`가 PR을 확인하고 GitHub에 코멘트를 남길 때까지 worker·lint·sfx를 대기 상태로 유지한다.
- Lead는 사용자에게 PR URL을 보고하고 리뷰 결과를 기다린다.
- worker·lint·sfx는 SendMessage 없이 idle. 자동 종료되지 않는다.

### 3-5. 리뷰 코멘트 응대

리뷰 코멘트가 달리면 Lead가 다음 중 하나로 진행한다:
1. 사용자가 "리뷰 반영해" 류 지시 → Lead가 `gh pr view <번호> --comments`로 코멘트를 읽고, 요약·우선순위와 함께 `SendMessage(to: "worker", ...)`로 전달
2. worker가 수정 → lint·sfx 재검증 → 추가 커밋 push → Lead에 보고
3. 추가 라운드가 필요하면 3-5 반복

응대 사이클이 끝나고 사용자가 머지를 진행할 때까지 팀은 계속 유지한다.

### 3-6. 머지 후 정리

사용자가 PR을 직접 머지한 사실을 확인한 후 (`gh pr view <번호> --json state` → `MERGED`):
```
SendMessage({to: "worker", message: {type: "shutdown_request"}})
SendMessage({to: "lint",   message: {type: "shutdown_request"}})
SendMessage({to: "sfx",    message: {type: "shutdown_request"}})
```
팀원 전원이 `shutdown_response(approve: true)` 회신 후:
```
TeamDelete()
```

머지 전에 팀을 종료하지 않는다 — 리뷰 응대를 위해 worker가 살아있어야 한다.

## 4단계: 워크트리 정리 (머지 후)

PR 머지 + 팀 종료 후:
```bash
git worktree remove .worktrees/feature-$0
git branch -d feature/$0
```
