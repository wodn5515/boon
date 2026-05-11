---
name: followup
description: PR의 후속 처리를 자동화한다. PR 번호를 받아 상태를 확인하고, OPEN이면 신규 리뷰 코멘트를 worker에 위임, MERGED/CLOSED면 팀 종료·워크트리·브랜치 정리를 수행한다. Lead 세션에서 호출.
argument-hint: "<PR번호>"
---

# PR 후속 처리

`/followup $0` — PR 상태를 확인해 분기 처리한다.

## 1단계: PR 상태 수집

```!
gh pr view $0 --json state,number,title,url,headRefName,headRefOid,baseRefName,mergedAt,closedAt,author,commits,comments,reviews,latestReviews,mergeable,mergeStateStatus
```

`reviewThreads`는 `gh pr view --json`이 지원하지 않으므로(REST에 없고 GraphQL 전용) GraphQL로 별도 조회한다. 필요한 이유: 리뷰 코멘트의 **resolved 여부**로 필터링하기 위함.

```!
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)
gh api graphql -F owner="$OWNER" -F repo="$REPO" -F number=$0 -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 50) {
            nodes {
              author { login }
              body
              createdAt
            }
          }
        }
      }
    }
  }
}'
```

수집한 정보:
- **state**: OPEN / MERGED / CLOSED
- **headRefName**: 작업 브랜치명 (예: `feature/xxx`, `hotfix/xxx`, `chore/xxx`)
- **baseRefName**: 머지 대상 (`stage` / `main`)
- **mergeable**: `MERGEABLE` / `CONFLICTING` / `UNKNOWN` — 컨플릭트 검출용. OPEN PR에서만 의미 있다.
- **mergeStateStatus**: `CLEAN` / `DIRTY` / `BLOCKED` / `BEHIND` / `UNSTABLE` / `HAS_HOOKS` / `UNKNOWN` — `DIRTY`가 컨플릭트 신호. `BEHIND`는 base 갱신 누락(체크 통과 못함)이며 보통 머지 자체는 가능.
- **마지막 커밋 시각**: `commits[-1].committedDate` — 신규 코멘트 판정 기준. rebase·cherry-pick 시 갱신되는 committer date를 의도적으로 사용한다. 기준은 "코드 상태가 마지막으로 바뀐 시점"이므로 author date가 아닌 committer date가 맞다.

## 2단계: 분기

state 값에 따라 아래 섹션 중 하나만 실행한다.

---

### A. state == "OPEN"

#### A-0. 머지 컨플릭트 검출 (코멘트 검출보다 우선)

`mergeable` 값으로 분기한다.

| mergeable | 의미 | 처리 |
|-----------|------|------|
| `MERGEABLE` | 정상 | A-1로 진행 |
| `CONFLICTING` | 컨플릭트 | A-0-conflict로 해소 위임 |
| `UNKNOWN` | GitHub 검사 중 | "잠시 후 `/followup $0` 재실행" 안내 후 종료 |

`mergeStateStatus == BEHIND`만 단독으로 뜨고 `mergeable == MERGEABLE`이면 머지 자체는 가능하므로 A-1로 진행한다 (CI 정책상 base 갱신을 강제하는 경우에만 별도 처리).

##### A-0-conflict. 컨플릭트 해소 위임

워크트리 매칭:
```!
git worktree list
```
출력에서 `headRefName`과 일치하는 항목의 경로를 찾는다.

**Lead 세션에 같은 브랜치 작업의 worker 팀이 살아있는 경우:**
- `SendMessage(to: "worker", ...)`로 다음을 전달:
  - PR URL, headRefName, baseRefName, 워크트리 경로
  - 작업 지시 (워커가 그대로 실행):
    1. `cd <워크트리>` (워크트리는 이미 headRefName 체크아웃 상태)
    2. `git fetch origin <baseRefName>`
    3. `git merge origin/<baseRefName>` — 컨플릭트 발생
    4. `git status --short`으로 컨플릭트 파일 식별
    5. 각 파일을 열어 **PR의 의도를 보존하며** 해소. 단순 텍스트 충돌이라도 base 쪽 변경의 의미를 git log로 확인 후 결정. 어떤 헝크를 골라야 할지 모호하면 Lead에게 SendMessage로 질의.
    6. 해소 후 빌드/검증 (frontend 변경이면 `npm run build:css`, Python 변경이면 적어도 import 에러 없이 docker-compose가 기동되는지 확인)
    7. `git add` + `git commit` (메시지: `[chore] origin/<baseRefName> 머지 — 컨플릭트 해소`)
    8. lint·sfx에게 SendMessage로 검증 요청
    9. lint/sfx 통과 후 `git push`
    10. Lead에 컨플릭트 해소 보고
- worker 라운드 완료 후 다시 `/followup $0`로 mergeable 재확인 → MERGEABLE이면 A-1로, 여전히 CONFLICTING이면 A-0-conflict 재진입.

**팀이 없는 세션:**
```
PR #$0 컨플릭트 발생. 이 세션에는 작업 팀이 없습니다.
워크트리: <매칭된 경로 또는 '없음'>
작업 세션에서 다시 `/followup $0`을 실행해 컨플릭트를 해소하거나,
직접 워크트리에서 `git fetch origin <baseRefName> && git merge origin/<baseRefName>`로 해소 후 push 하세요.
```
보고 후 종료.

**주의 사항:**
- `feature/* → stage`, `hotfix/* → main`은 **rebase가 아니라 merge로** 해소한다 (Squash 머지가 어차피 commit history를 한 줄로 합치므로 merge commit이 어차피 사라짐. rebase는 push --force가 필요해 리뷰 코멘트와 코드가 어긋날 위험).
- `stage → main` PR이 컨플릭트인 경우는 거의 없지만, 발생하면 stage 자체에서 `git merge origin/main`으로 해소 — stage는 공유 브랜치이므로 절대 rebase하지 마라.
- `git push --force`는 절대 사용하지 않는다 (`-d`/`-D`/`-f` 모두 금지). merge commit으로만 해소.

#### A-1. 신규 코멘트 검출

다음 코멘트들을 모은다 (resolved된 review thread는 제외):
- issue comments (`comments`)
- review comments (`reviewThreads[].comments`)
- review summaries (`reviews[].body`, body가 비어있지 않은 것만)

각 코멘트의 `createdAt`(또는 `submittedAt`)이 **마지막 커밋 시각보다 늦은 것**만 신규로 간주한다.

#### A-2. 신규 코멘트 없음

```
PR #$0: 미반영 코멘트 없음. 머지 대기 중.
```

위 한 줄 보고 후 종료.

#### A-3. 신규 코멘트 있음

각 코멘트를 다음 형식으로 정리:

```
[작성자] (위치: 파일:라인 또는 "PR전체")
원문 인용 또는 요점

→ 우선순위 추정: 🔴 must / 🟡 should / 🟢 nit / 💬 question
```

이후 분기:

**Lead 세션에 같은 브랜치(`headRefName`) 작업의 worker 팀이 살아있는 경우:**
- Lead는 자기가 spawn한 `team_name`을 conversation context에서 회상한다
- `SendMessage(to: "worker", ...)`로 코멘트 요약 + 우선순위 + PR URL 전달
- worker가 응대 사이클 진행 (`.claude/agents/worker.md`의 "Lead와의 통신" 섹션)
- Lead는 worker의 라운드 완료 SendMessage를 기다린다

**팀이 없는 세션 (다른 세션에서 호출):**

워크트리 경로 탐색:
```!
git worktree list
```
출력에서 `headRefName`과 일치하는 항목의 경로를 찾는다. 매칭이 없으면 "워크트리 없음 (이미 정리됨 또는 다른 머신)"으로 안내.

```
PR #$0에 신규 코멘트 N건. 이 세션에는 작업 팀이 없습니다.
워크트리: <매칭된 경로 또는 '없음'>
작업 세션에서 다시 `/followup $0`을 실행하거나, 직접 worktree에 들어가 처리해주세요.
```
보고 후 종료.

---

### B. state == "MERGED"

```!
git worktree list
```

`headRefName`으로 워크트리 매칭 → 다음 순서로 정리.

#### B-1. 팀 종료 (Lead 세션에 팀이 살아있는 경우)

```
SendMessage({to: "worker", message: {type: "shutdown_request"}})
SendMessage({to: "lint",   message: {type: "shutdown_request"}})
SendMessage({to: "sfx",    message: {type: "shutdown_request"}})
```

전원 `shutdown_response(approve: true)` 회신 후:
```
TeamDelete()
```

팀이 없으면 이 단계 건너뛴다 (다른 세션에서 이미 종료했거나 애초에 단순 작업이라 팀이 없었던 경우).

#### B-2. 워크트리 + 로컬 브랜치 정리

```bash
git worktree remove <매칭된 워크트리 경로>
git branch -d <headRefName>
```

`-d`가 "브랜치 머지 안 됨" 사유로 실패하면 사용자에게 알리고 멈춘다. `-D` 강제 삭제는 사용자 명시 동의 후에만.

#### B-3. hotfix 머지였다면 stage 동기화 안내

`baseRefName`이 `main` 또는 `master`이고 `headRefName`이 `hotfix/*` 패턴이면:
```
hotfix가 main에 머지됨. `/sync`로 stage 동기화를 진행하세요.
```

#### B-4. origin 브랜치 정리

GitHub의 "Automatically delete head branches" 설정이 켜져 있으면 자동 삭제됨. 켜져 있지 않은 환경이면 사용자에게 안내만 하고 자동 수행하지 않는다:
```
원격 브랜치 origin/<headRefName>이 남아있을 수 있음. 필요시 GitHub UI 또는 `git push origin --delete <headRefName>`로 삭제.
```

---

### C. state == "CLOSED" (not merged)

`mergedAt == null && closedAt != null` 조건.

1. PR description, 마지막 코멘트, closing 커밋 메시지 등을 보여주고 닫힘 사유를 사용자와 확인
2. 사용자 동의 시:
   ```bash
   git worktree remove <경로>
   git branch -d <headRefName>
   ```
   `-d` 실패 시(머지 안 된 변경 있음) `-D` 사용 여부를 사용자에게 다시 확인
3. 사용자가 "보존" 선택 시 그대로 둔다

---

## 3단계: 결과 보고

처리 결과를 한두 줄로 요약 (예시):
- `PR #$0 OPEN — 신규 코멘트 3건 worker에 전달, 응대 대기`
- `PR #$0 OPEN — 미반영 코멘트 없음, 머지 대기`
- `PR #$0 OPEN 컨플릭트 — worker에게 origin/<base> 머지 위임`
- `PR #$0 OPEN — mergeable UNKNOWN, GitHub 검사 중. 잠시 후 재호출`
- `PR #$0 MERGED — 팀 종료 + 워크트리/브랜치 정리 완료. /sync 권장`
- `PR #$0 CLOSED — 사용자 보존 선택, 정리 보류`

## 절대 금지

- 머지된/닫힌 PR의 브랜치에 추가 push
- `git branch -D` 강제 삭제 (사용자 명시 동의 없이)
- 메인 워크트리(stage/main 체크아웃)에 대해 `git worktree remove` 시도
- PR을 직접 머지·닫기 (사용자가 수행)
- worker 팀이 살아있는데 `/followup` 호출자가 위임 없이 직접 코드 수정
- 컨플릭트 해소 시 `git rebase` + `git push --force` (Squash 머지 정책상 merge commit 한 번이면 충분, force push는 리뷰 사이클을 깨뜨림)
