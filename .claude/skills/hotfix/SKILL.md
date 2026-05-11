---
name: hotfix
description: 긴급 수정이 필요할 때 사용한다. 먼저 기존 워크트리와 PR 상태를 확인하여 이어서 작업할지 새로 시작할지 판단한 후, 필요하면 main 브랜치 기반으로 worktree를 생성한다.
argument-hint: "<브랜치명> [이슈설명]"
---

# 핫픽스 시작

## 1단계: 연속성 확인 (필수)

작업을 시작하기 전에 반드시 다음을 순서대로 확인한다.

### 기존 워크트리 확인
```!
git worktree list
```
```!
find .worktrees -maxdepth 1 -name 'hotfix-*' 2>/dev/null
```

### 관련 PR 확인
```!
gh pr list --state all --limit 20
```

### 판단

| 상황 | 행동 |
|------|------|
| 같은 주제의 워크트리가 존재하고 PR이 **열려있음** | 해당 워크트리 경로를 안내. 새로 만들지 않음 |
| 같은 주제의 PR이 **머지됨** + 워크트리 존재 | 워크트리 정리 후 새 워크트리 생성 |
| 관련 워크트리/PR 없음 | 새 워크트리 생성 |

## 2단계: 워크트리 생성 (새 작업인 경우)

```!
git fetch origin
```

```bash
mkdir -p .worktrees
git worktree add -b hotfix/$0 .worktrees/hotfix-$0 origin/master
```

### gitignore 파일 심링크 (필수)
gitignored 파일만 개별 심링크한다. `.claude` 디렉토리 전체를 심링크하면 git이 tracked 파일 삭제로 인식하므로 주의.

```bash
# settings.local.json 심링크 (권한 설정)
ln -sf "$(pwd)/.claude/settings.local.json" ".worktrees/hotfix-$0/.claude/settings.local.json"
# settings.py가 있으면 심링크
[ -f settings.py ] && ln -sf "$(pwd)/settings.py" ".worktrees/hotfix-$0/settings.py"
```

## 3단계: 안내

### 새 워크트리를 생성한 경우
- worktree 경로: `.worktrees/hotfix-$0`
- 새 탭(세션)에서 `cd .worktrees/hotfix-$0`으로 이동하여 작업 시작
- 작업 완료 후 `/pr`로 main 대상 PR 생성
- main 머지 후 `/sync`로 stage 동기화 필요

### 기존 워크트리에서 이어가는 경우
- 기존 worktree 경로를 안내
- 열린 PR이 있으면 PR 번호도 함께 안내

### PR 머지 후 정리
- `git worktree remove .worktrees/hotfix-$0`
- `git branch -d hotfix/$0`
- `/sync`로 main → stage 동기화
