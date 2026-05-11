#!/bin/bash
# validate-git.sh 훅 단위 테스트
#
# 훅에 여러 JSON 페이로드를 주입해 기대대로 통과/차단되는지 검증한다.
# 실제 git push는 일으키지 않는다.
#
# 실행: ./test_validate_git.sh
# 종료 코드: 0 = 모든 테스트 통과, 1 = 하나라도 실패

set -u

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/validate-git.sh"
if [ ! -x "$HOOK" ]; then
  echo "훅 스크립트를 찾을 수 없거나 실행 권한 없음: $HOOK" >&2
  exit 2
fi

PASS=0
FAIL=0

run_case() {
  local desc="$1"
  local expected="$2"
  local payload="$3"

  local actual_err actual_code
  actual_err=$(echo "$payload" | "$HOOK" 2>&1 >/dev/null)
  actual_code=$?

  if [ "$actual_code" -eq "$expected" ]; then
    PASS=$((PASS+1))
    printf "  PASS: %s (exit=%d)\n" "$desc" "$actual_code"
  else
    FAIL=$((FAIL+1))
    printf "  FAIL: %s (expected=%d, got=%d)\n" "$desc" "$expected" "$actual_code"
    [ -n "$actual_err" ] && printf "        stderr: %s\n" "$actual_err"
  fi
}

# 테스트용 임시 git repo 2개 생성
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM
MAIN_WT="$TMP/main-wt"
SUB_WT="$TMP/sub-wt"
mkdir -p "$MAIN_WT" "$SUB_WT"

(cd "$MAIN_WT" && git init -q -b merged-branch-fake && \
  git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init)
(cd "$SUB_WT" && git init -q -b feature/new-work-fake && \
  git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init)

echo "== 케이스 1: cwd가 서브 worktree(미머지 브랜치)를 가리키면 통과 =="
run_case \
  "cwd=sub-wt(feature/new-work-fake), git push 명령" \
  0 \
  "$(jq -nc --arg cmd "git push origin feature/new-work-fake" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 2: cwd가 메인 worktree(다른 브랜치) — 서브에서 명령 발행, 판정은 cwd 기준 =="
run_case \
  "cwd=main-wt(merged-branch-fake), 실제 머지 PR 없으면 통과" \
  0 \
  "$(jq -nc --arg cmd "git push origin merged-branch-fake" --arg cwd "$MAIN_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 3: stage 직접 git push 차단 (기존 동작 유지) =="
run_case \
  "git push origin stage 차단" \
  2 \
  "$(jq -nc --arg cmd "git push origin stage" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 4: main 직접 git push 차단 (기존 동작 유지) =="
run_case \
  "git push origin main 차단" \
  2 \
  "$(jq -nc --arg cmd "git push origin main" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 5: force git push 차단 =="
run_case \
  "git push --force 차단" \
  2 \
  "$(jq -nc --arg cmd "git push --force origin foo" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 6: git command 없는 명령은 통과 =="
run_case \
  "ls 명령은 통과" \
  0 \
  "$(jq -nc --arg cmd "ls -la" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 7: cwd 필드 없는 경우 — 명령어에서 브랜치 추출 후 판정 =="
run_case \
  "cwd 없음, 존재하지 않는 브랜치 git push" \
  0 \
  "$(jq -nc --arg cmd "git push origin feature/nonexistent-xyz-123456" '{tool_input:{command:$cmd}}')"

echo "== 케이스 8: cwd도 명령어 인자도 없는 git push — 판별 불가, 안전 통과 =="
run_case \
  "cwd 없음, 'git push'만" \
  0 \
  "$(jq -nc --arg cmd "git push" '{tool_input:{command:$cmd}}')"

echo "== 케이스 9: cwd가 잘못된 경로여도 안전 통과 =="
run_case \
  "cwd가 존재하지 않는 디렉토리" \
  0 \
  "$(jq -nc --arg cmd "git push origin feature/some-branch-xyz-123" --arg cwd "/no/such/dir" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 10: git push -u origin branch 형태 =="
run_case \
  "-u 플래그가 있어도 브랜치명 정확 추출" \
  0 \
  "$(jq -nc --arg cmd "git push -u origin feature/new-work-fake" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 11: HEAD:branch 형태 =="
run_case \
  "HEAD:branch 형태 git push" \
  0 \
  "$(jq -nc --arg cmd "git push origin HEAD:feature/new-work-fake" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 12: 명령어에 명시된 브랜치가 우선 (cwd는 다른 브랜치) =="
# 메인 워크트리(머지됨)에서 서브 워크트리 브랜치로 git push — 명령어 기반 판정으로 통과
run_case \
  "cwd=머지됨, 명령어=미머지 브랜치 -> 통과" \
  0 \
  "$(jq -nc --arg cmd "git push -u origin feature/new-work-fake" --arg cwd "$MAIN_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 13: 명령어의 브랜치가 (로컬 repo에서 머지로 본) 머지 브랜치 — 차단 =="
# gh pr list는 실제 레포지토리 기준이라 테스트 repo에선 모킹이 어렵다.
# 여기서는 '명령어 파싱이 브랜치를 우선적으로 반영한다'는 동작만 재검증.
# 실제 머지된 브랜치 차단은 위 케이스 A(통합 스크립트)에서 검증함.
run_case \
  "HEAD:branch 형태 명시 브랜치 우선" \
  0 \
  "$(jq -nc --arg cmd "git push origin HEAD:feature/new-work-fake" --arg cwd "$MAIN_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 14: 문자열 속 git push도 단어 경계로 트리거되지만 폴백으로 안전 통과 =="
# grep 매칭 규칙: 단어 경계(\b)로 git push만 트리거. 따옴표로 감싼 문자열 안의 우연한 출현은
# 단어 경계로 걸러지지 않을 수 있으나, echo 인자로 공백 구분된 평범한 단어들이면 트리거된다.
# 이 케이스는 echo 명령을 가장 앞에 두지만 뒤에 'git push'가 단어 경계로 등장하므로
# 훅이 보수적으로 트리거한 뒤, ARGS/브랜치 판별에서 안전하게 폴백/통과로 처리된다.
run_case \
  "echo some note about git push usage 명령은 안전 통과" \
  0 \
  "$(jq -nc --arg cmd "echo some note about git push usage" --arg cwd "$MAIN_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 15: git push 단독 -> cwd 폴백, BRANCH='push' 오파싱 방지 =="
# 과거 sed 패턴이 'git push' 단독 시 아무것도 치환하지 않아 ARGS='git push',
# awk '{print $NF}' -> 'push'가 REFSPEC로 잡혀 브랜치로 오인되는 회귀가 있었다.
# 수정된 sed는 선택적 공백으로 'git push' 전체를 없애고, 방어 블록이 ARGS가 여전히
# 'git push'로 시작하면 빈 값으로 리셋한다. 결과적으로 cwd 폴백을 타야 한다.
run_case \
  "git push 단독, cwd=서브 -> 통과 (오파싱 방지)" \
  0 \
  "$(jq -nc --arg cmd "git push" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 16: 세미콜론 뒤 git push 트리거 확인 =="
# 단어 경계 정규식으로 ';', '&', '|', subshell 내부도 트리거 대상.
# feature/new-work-fake은 미머지라 실제 gh pr list에서도 이미 머지된 PR이 없어 통과.
run_case \
  "ls;git push origin feature/new-work-fake -> 통과" \
  0 \
  "$(jq -nc --arg cmd "ls;git push origin feature/new-work-fake" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 17: subshell 내부 git push 트리거 확인 =="
run_case \
  "echo \"\$(git push origin feature/new-work-fake)\" -> 트리거 후 통과" \
  0 \
  "$(jq -nc --arg cmd 'echo "$(git push origin feature/new-work-fake)"' --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 18: --dry-run이 REFSPEC로 잡히지 않고 BRANCH=feature/foo 인식 =="
# feature/foo가 미머지 브랜치로 처리되어 통과.
run_case \
  "git push --dry-run origin feature/foo -> 브랜치 정확 추출, 통과" \
  0 \
  "$(jq -nc --arg cmd "git push --dry-run origin feature/foo" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 19: force-refspec '+' 접두사 제거 후 BRANCH=feature/foo 인식 =="
run_case \
  "git push origin +feature/foo -> '+' 제거, 통과" \
  0 \
  "$(jq -nc --arg cmd "git push origin +feature/foo" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 20: --no-verify가 REFSPEC로 잡히지 않음 =="
# 확장된 KNOWN_FLAGS에 --no-verify 포함. 이전엔 ARGS 끝에 --no-verify가 남아
# REFSPEC='--no-verify'로 오인돼 cwd 폴백으로 빠졌다.
run_case \
  "git push -u origin feature/new-work-fake --no-verify -> 브랜치 정확 추출, 통과" \
  0 \
  "$(jq -nc --arg cmd "git push -u origin feature/new-work-fake --no-verify" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 21: --push-option=<val>도 플래그로 흡수 =="
run_case \
  "git push -u origin feature/new-work-fake --push-option=ci.skip -> 통과" \
  0 \
  "$(jq -nc --arg cmd "git push -u origin feature/new-work-fake --push-option=ci.skip" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 22: --progress --prune 동시 흡수 =="
run_case \
  "git push --progress --prune origin feature/new-work-fake -> 통과" \
  0 \
  "$(jq -nc --arg cmd "git push --progress --prune origin feature/new-work-fake" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo "== 케이스 23: 여러 줄 명령어 — TOKEN_COUNT 합산 안정성 =="
# 과거 awk '{print NF}'가 행마다 수를 출력해 비교 실패 → cwd 폴백 오탐이었다.
# 수정된 wc -w는 전체 단어 수를 한 번에 합산하므로 안전.
run_case \
  "여러 줄 명령어 속 git push (세미콜론 join) -> 통과" \
  0 \
  "$(jq -nc --arg cmd "echo foo; git push -u origin feature/new-work-fake; echo bar" --arg cwd "$SUB_WT" '{tool_input:{command:$cmd}, cwd:$cwd}')"

echo
echo "결과: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
