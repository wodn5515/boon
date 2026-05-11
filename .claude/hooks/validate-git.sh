#!/bin/bash
# git 명령어 검증 스크립트
# exit 0: 허용, exit 2: 차단 (stderr 메시지 표시)
#
# 안전 기본값: 판별 불가한 엣지 케이스는 통과시킨다. 훅 자체의 오탐으로
# 정당한 push가 막히는 것보다, 드물게 한 번 통과되는 편이 낫다.
#
# ----------------------------------------------------------------------
# push 차단 규칙 (stage/main / force / 머지된 브랜치) 테스트 케이스
# ----------------------------------------------------------------------
# [정탐: 차단돼야 함]
#   git push origin stage
#   git push origin main
#   git push origin HEAD:stage
#   git push origin HEAD:main
#   git push --force origin stage
#   git push -f origin feature/foo                      # -f short option
#   git push -fu origin feature/foo                     # -f 결합 플래그
#   git push -u origin stage
#   git push origin +stage                              # force-refspec 접두사
#   git push origin refs/heads/stage                    # 풀 ref
#   git push origin refs/heads/main
#   git push origin HEAD:refs/heads/stage
#   git push --force --force-with-lease origin ...      # force 혼용 (우회 방지)
#   git push --force-with-lease --force origin ...      # force 혼용 역순
#   (cwd가 stage/main 브랜치인 worktree에서) git push / git push origin
#
# [오탐 해소: 통과해야 함 — 과거엔 substring 매칭으로 차단됐던 케이스]
#   git push -u origin feature/stage-new-ui-enabled
#   git push origin feature/stage-cleanup
#   git push origin main-old-branch
#   git push origin feature/mainline
#   git push origin hotfix/stage-config-fix
#   git push origin feature/foo:feature/foo    # dst가 feature 브랜치
#   git push --force-with-lease origin feature/foo              # lease 단독
#   git push --force-with-lease=<ref>:<sha> origin feature/foo  # lease expected-sha 지정
#   git push --force-with-lease --force-if-includes ...         # lease + if-includes
# ----------------------------------------------------------------------

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# force push 차단
#
# 방침:
#   - `--force`, `-f` (short option) → 차단
#   - `--force-with-lease`, `--force-with-lease=<...>`, `--force-if-includes` → 허용
#     (settings.json에서 force-with-lease 계열만 허용)
#   - `--force`와 `--force-with-lease`가 **함께 지정된 경우**도 차단
#     (Git는 뒤에 오는 옵션이 이기지만, 훅 입장에서 의도가 모호하고 우회 소지가 있어 안전하게 차단)
#
# 구 구현 버그:
#   - `--force-with-lease` 존재 여부만으로 전체를 허용했기 때문에
#     `git push --force --force-with-lease ...` 같은 혼용이 통과됐다 (Codex P1).
#   - `-f` short option도 누락돼 `git push -f ...`가 통과됐다.
#
# 현 구현:
#   - `--force`만 단독 일치하는지, `-f`가 short option으로 있는지 토큰 기준으로 검사.
#   - `--force-with-lease` 등 접미사가 붙은 변종은 제외.
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+push\b'; then
  # push 이후 인자에서 force 관련 토큰 검사
  PUSH_ARGS=$(echo "$COMMAND" | sed -E 's/^.*git[[:space:]]+push([[:space:]]+|$)//')
  IS_FORCE=0
  # --force 정확 일치 (다음 문자가 없거나 공백 — --force-with-lease, --force-if-includes 제외)
  if echo " $PUSH_ARGS " | grep -qE '[[:space:]]--force([[:space:]]|$)'; then
    IS_FORCE=1
  fi
  # -f short option (단독 또는 다른 short option과 결합된 -fu 등)
  # -u/-n/-q/-v 등과 결합될 수 있으므로, 길이 2 이상의 단독 하이픈 플래그에서 f 포함 여부 검사
  if echo " $PUSH_ARGS " | grep -qE '[[:space:]]-[A-Za-z]*f[A-Za-z]*([[:space:]]|$)'; then
    IS_FORCE=1
  fi
  if [ "$IS_FORCE" -eq 1 ]; then
    echo "🔴 차단: force push는 허용되지 않습니다." >&2
    exit 2
  fi
fi

# git merge 차단: 현재 브랜치가 stage/main인 경우에만 차단.
#
# 의도: stage/main에 우회 머지(PR 미경유)를 막는 것.
# feature/hotfix/chore/fix 등 작업 브랜치에서 origin/stage·origin/main을 흡수해
# 충돌을 해소하는 정상 동기화는 허용. 어차피 stage/main으로의 push 자체가
# 아래 push 차단 로직에서 막히므로, merge 단계에서 일괄 차단할 필요가 없다.
#
# 구 구현은 모든 git merge를 차단해 feature 브랜치의 stage 흡수까지 막아
# /followup 스킬의 컨플릭트 해소 절차와 모순됐다 (PR #281 절차).
if echo "$COMMAND" | grep -qE 'git\s+merge\b'; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
  CURRENT_BRANCH=""
  if [ -n "$CWD" ] && [ -d "$CWD" ]; then
    CURRENT_BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
  fi
  if [ "$CURRENT_BRANCH" = "stage" ] || [ "$CURRENT_BRANCH" = "main" ]; then
    echo "🔴 차단: stage/main 브랜치에서 git merge는 허용되지 않습니다. PR을 통해서만 머지하세요." >&2
    exit 2
  fi
fi

# git reset --hard 차단
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  echo "🔴 차단: git reset --hard는 허용되지 않습니다." >&2
  exit 2
fi

# PR 머지 차단 (gh pr merge)
if echo "$COMMAND" | grep -qE 'gh\s+pr\s+merge'; then
  echo "🔴 차단: PR 머지는 사용자가 직접 수행해야 합니다." >&2
  exit 2
fi

# ----------------------------------------------------------------------
# push 대상 브랜치 기반 차단 (stage/main 직접 push, 머지된 PR 브랜치 push)
# ----------------------------------------------------------------------
#
# 구 구현은 `git\s+push\s+.*\bstage\b` 같은 단순 regex로 차단했다.
# 하지만 `\b`가 `/`, `-` 앞뒤에서도 word boundary로 동작하기 때문에
# `feature/stage-new-ui-enabled` 같은 브랜치명에서 substring 오탐이 났다.
#
# 개선 방식:
#   a) push 명령어 인자에서 실제 push 대상(dst refspec)을 파싱한다.
#      - `git push <remote> <refspec>`
#      - `git push <remote> <src>:<dst>` → dst 부분만 추출
#      - `git push <remote> +<refspec>` → 선두 `+` 제거
#      - `git push <remote> HEAD:<branch>` → HEAD는 src이므로 dst만 봄
#      - `git push <remote> refs/heads/<branch>` → `refs/heads/` 접두사 제거
#   b) 명령어에 브랜치가 없거나 `HEAD`만 적힌 경우에 한해, payload `cwd`로 폴백.
#   c) 파싱된 BRANCH가 `stage`/`main`이면 차단, 그 외엔 머지된 PR 여부 확인.
#   d) 양쪽 모두 판별 실패 시 조용히 통과 (안전 기본값).
#
# 또한 문자열 안에 우연히 `git push`가 포함된 다른 명령(예: python3 -c 안 인용)
# 은 트리거하지 않도록, 단어 경계(\b)를 활용하여 `git push`만 매칭한다.
# 이렇게 하면 `;`, `&`, `|`, subshell `$(`, 백틱 내부 `git push`도 모두 트리거되며,
# 문자열 안 오탐은 단어 경계로 대부분 방지된다.
if echo "$COMMAND" | grep -qE '\bgit[[:space:]]+push\b'; then
  # 1) push 명령어에서 브랜치명을 추출한다 (최우선).
  #    지원 형태:
  #      git push <remote> <branch>
  #      git push <remote> HEAD:<branch>
  #      git push <remote> <src>:<dst>
  #      git push -u <remote> <branch>
  #      git push <remote> refs/heads/<branch>
  #      git push <remote> +<branch>
  #    이 방식을 우선하는 이유: Claude Code 훅 payload의 `cwd`는 세션의
  #    CWD(주로 메인 워크트리)이지 push가 실행될 worktree가 아니어서,
  #    cwd에만 의존하면 병렬 worktree에서 오탐이 발생한다.
  #    명령어에 브랜치가 명시돼 있으면 그 값이 가장 신뢰할 수 있다.
  BRANCH=""
  # push 명령이 취할 수 있는 알려진 플래그 목록. 값이 붙는 형태(--opt=val)는 [^ ]*로 흡수한다.
  # 누락된 플래그가 있으면 REFSPEC로 오인돼 브랜치로 오탐할 수 있으므로 자주 쓰이는 것부터 열거.
  KNOWN_FLAGS='(-u|--set-upstream|--follow-tags|--tags|--atomic|--dry-run|-n|--force-with-lease[^ ]*|--force|-f|-q|--quiet|-v|--verbose|--no-verify|--progress|--no-progress|--prune|--push-option=[^ ]*|--signed=[^ ]*|--recurse-submodules=[^ ]*|--ipv4|-4|--ipv6|-6|--thin|--no-thin|--mirror|--all)'
  ARGS=$(echo "$COMMAND" \
    | sed -E 's/^.*git[[:space:]]+push([[:space:]]+|$)//' \
    | sed -E "s/(^| )${KNOWN_FLAGS}( |$)/ /g")
  # 방어: ARGS가 여전히 'git push'로 시작하거나 전체가 'git push'로만 구성된 경우
  # (sed 치환 실패 등 예외 상황) 빈 값으로 리셋하여 cwd 폴백 경로로 보낸다.
  if echo "$ARGS" | grep -qE '^[[:space:]]*git[[:space:]]+push([[:space:]]|$)'; then
    ARGS=""
  fi
  REFSPEC=$(echo "$ARGS" | awk '{print $NF}')
  REFSPEC_ORIG="$REFSPEC"
  # src:dst 형태면 dst만 남긴다
  case "$REFSPEC" in
    *:*) REFSPEC="${REFSPEC##*:}" ;;
  esac
  # force-refspec 접두사 '+' 제거 (예: +feature/foo -> feature/foo)
  REFSPEC="${REFSPEC#+}"
  # refs/heads/<name> 접두사 제거 (예: refs/heads/stage -> stage)
  REFSPEC="${REFSPEC#refs/heads/}"
  # awk '{print NF}'는 여러 줄 입력 시 행마다 수를 출력해 비교가 실패한다.
  # wc -w는 입력 전체의 단어 수를 한 번에 합산하므로 안전.
  TOKEN_COUNT=$(echo "$ARGS" | wc -w | tr -d ' ')
  # 브랜치명 검증: 선두 하이픈 금지 (옵션 플래그로 오인 방지)
  if [ "${TOKEN_COUNT:-0}" -ge 2 ] && [ -n "$REFSPEC" ] && echo "$REFSPEC" | grep -qE '^[A-Za-z0-9._/][A-Za-z0-9._/-]*$'; then
    BRANCH="$REFSPEC"
  fi

  # 2) 명령어에 브랜치가 없거나 `HEAD`만 적힌 경우에 한해 cwd 기반으로 판정한다.
  #    `git push` 단독, `git push origin`, `git push origin HEAD` 등이 여기에 해당.
  if [ -z "$BRANCH" ] || [ "$REFSPEC_ORIG" = "HEAD" ]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
    if [ -n "$CWD" ] && [ -d "$CWD" ]; then
      BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
    fi
  fi

  # 3) 브랜치가 stage/main이면 차단 (정확히 일치 비교 — substring 매칭 금지)
  if [ "$BRANCH" = "stage" ]; then
    echo "🔴 차단: stage 브랜치에 push할 수 없습니다. PR을 통해서만 머지하세요." >&2
    exit 2
  fi
  if [ "$BRANCH" = "main" ]; then
    echo "🔴 차단: main 브랜치에 push할 수 없습니다. PR을 통해서만 머지하세요." >&2
    exit 2
  fi

  # 4) stage/main이 아니면 머지된 PR 여부 확인
  if [ -n "$BRANCH" ]; then
    MERGED_PR=$(gh pr list --head "$BRANCH" --state merged --json number --jq '.[0].number // empty' 2>/dev/null)
    if [ -n "$MERGED_PR" ]; then
      echo "🔴 차단: 브랜치 '$BRANCH'의 PR #$MERGED_PR은 이미 머지되었습니다. 새 브랜치를 생성하세요." >&2
      exit 2
    fi
  fi
  # 브랜치 판별 실패 시 조용히 통과 (안전 기본값)
fi

exit 0
