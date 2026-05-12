---
name: meta
description: 메타 작업(문서·설정·.claude 에이전트/스킬·CI 설정 등 코드 외 변경) 전용 경량 흐름. /work와 달리 디자이너 게이트·TDD 게이트·peer 검증을 생략한다. 워크트리+PR은 그대로 쓴다. 사용자 가시 기능을 바꾸지 않는 변경에만 사용 — 코드 작업은 반드시 /work로.
argument-hint: "<브랜치명 또는 작업주제> [작업설명]"
---

# 메타 작업 시작 (경량 흐름)

## 적용 대상 / 비적용 대상

### 적용 (이 스킬 사용)
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/**` 문서 변경
- `.claude/agents/**`, `.claude/skills/**`, `.claude/hooks/**`, `.claude/settings*.json` 수정
- `.gitignore`, `package.json`의 dev 도구·script 항목, `tsconfig.json`, `eslint.config.*`, `prettier.config.*`
- CI 설정 (`.github/workflows/**`), 배포 설정
- 의존성 추가/제거 자체만 (구현 결합 없음)

### 비적용 (반드시 `/work` 사용)
- `app/**`, `components/**`, `lib/**`, `db/**` 등 사용자 가시 동작에 영향을 주는 모든 코드
- 마이그레이션, drizzle 스키마
- 사용자 가시 기능·라우트·UI 동작 변경

**판단 기준**: "이 변경이 사용자가 보는 화면·동작·데이터를 바꾸는가" 묻기. 아니면 `/meta`, 맞으면 `/work`.

---

## 1단계: 연속성 확인

```!
git worktree list
```
```!
find .worktrees -maxdepth 1 -name 'meta-*' -o -name 'feature-*' -o -name 'hotfix-*' 2>/dev/null
```
```!
gh pr list --state all --limit 20
```

같은 주제 워크트리/PR이 열려 있으면 그 위에서 이어가고, 새로 만들지 않는다.

## 2단계: 워크트리 생성

### 베이스 브랜치 결정 (자동 감지)

```!
git ls-remote --heads origin stage main master 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||'
```

우선순위: `origin/stage` → `origin/main` → `origin/master`. 첫 push 전이라 remote에 아무것도 없으면 **부트스트랩 예외 분기**(아래 참고).

### 일반 경로
```!
git fetch origin
```
```bash
mkdir -p .worktrees
# BASE는 위에서 감지한 브랜치 (예: origin/stage)
git worktree add -b meta/$0 .worktrees/meta-$0 origin/<BASE>
```

### gitignore 파일 심링크
```bash
mkdir -p ".worktrees/meta-$0/.claude"
ln -sf "$(pwd)/.claude/settings.local.json" ".worktrees/meta-$0/.claude/settings.local.json"
```

### 부트스트랩 예외 분기 (remote에 베이스가 없음)
remote가 비어 있거나 첫 push 전이면 워크트리를 생성할 수 없다. 다음 중 하나로 진행:
1. **즉시 사용 안 함** — Lead가 현재 default 브랜치(보통 `master`)에서 직접 작업하고 커밋. PR 생략. 결정 로그에 "부트스트랩 예외: remote 없음" 사유 기록
2. **선행 push** — 사용자에게 `git push -u origin <default>` 안내. push 후 다시 `/meta` 실행

판단은 Lead 자율. 결정 로그에 사유 한 줄 남긴다.

## 3단계: 작업 진행 (Lead 단독)

- **팀 spawn 없음** — worker/lint/sfx 호출하지 않는다
- **test-writer 호출 없음** — TDD 게이트 생략
- **designer 호출 없음** — 메타 작업이면 보통 UI 컴포넌트 골격 잡는 단계가 아니다 (예외: `.claude/agents/designer.md` 자체 수정은 메타 작업이지만 디자인 산출물은 아님)
- Lead가 직접 Read/Edit/Write로 변경 작업 수행
- 한국어 커밋 메시지 (`[docs]`, `[chore]`, `[infra]` 등). 메타 작업은 대부분 `[docs]` 또는 `[chore]`

### 검증
- 변경 파일이 `.sh`라면 `bash -n <file>`로 문법 체크
- `.json`/`.yaml`은 `jq` / `python -c "import yaml; yaml.safe_load(open('<f>'))"`로 파싱 확인
- 문서는 링크 깨짐만 확인 (`grep -E '\]\([^)]+\)' <f>` 후 존재 확인)
- 강제 자동화는 아님. Lead가 변경 성격에 맞게 골라서 수행

### 결정 로그
비자명한 결정이 발생한 경우 `docs/decisions/<NNN>-<slug>.md` 작성. 단순 오타·링크 수정은 불필요. 정책·운영 방침 변경은 필수.

## 4단계: PR 생성

```!
git push -u origin meta/$0
```

`/pr` 스킬 호출. PR 본문 템플릿은 `/pr`의 기본 형식을 따르되 다음 섹션을 명시:
- "## 작업 성격: 메타 (코드 변경 없음)"
- "## 테스트: 해당 없음 (메타 작업 — `/meta` 스킬 적용)"
- 결정 로그 링크 (있으면)

## 5단계: 리뷰 대기 / 머지 후 정리

- PR 생성 후 Lead는 idle 유지. reviewer가 코멘트를 남기면 Lead가 자율 판단으로 응대 (코드 작업처럼 worker 위임 흐름은 없음 — Lead 직접 처리)
- 사용자 머지 확인 후:
```bash
git worktree remove .worktrees/meta-$0
git branch -d meta/$0
```

## /work vs /meta 비교

| 단계 | /work | /meta |
|---|---|---|
| 워크트리 | ✅ | ✅ |
| 디자이너 게이트 | 조건부 | ❌ |
| TDD 게이트 (test-writer) | 조건부 | ❌ |
| 팀 spawn (worker + lint + sfx) | ✅ | ❌ (Lead 단독) |
| peer 검증 | ✅ | ❌ |
| README 동기화 의무 | ✅ | 작업 자체가 README면 그게 본문, 별개 |
| 결정 로그 | 비자명한 결정 시 | 비자명한 결정 시 |
| PR 생성 | ✅ | ✅ |
| 머지 후 정리 | ✅ | ✅ |

## 절대 금지
- 메타 워크플로우로 코드 변경 시도 (`app/**`, `components/**` 등). 그건 `/work`.
- main, stage 직접 push
- PR 머지 (사용자만)
- 첫 커밋이 메타 워크플로우의 게이트를 우회한다는 이유로 검증 절차를 생략하는 자의적 판단 — 메타 작업이라도 "이건 사실 코드 변경 아닌가" 의심되면 `/work`로 전환
