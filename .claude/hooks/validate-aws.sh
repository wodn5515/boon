#!/bin/bash
# AWS MCP 호출 시 --profile read-only 강제
# exit 0: 허용, exit 2: 차단 (stderr 메시지 표시)

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.cli_command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# cli_command가 배열인 경우 각 요소를 검사
IS_ARRAY=$(echo "$INPUT" | jq -r '.tool_input.cli_command | if type == "array" then "yes" else "no" end')

if [ "$IS_ARRAY" = "yes" ]; then
  BAD_CMD=$(echo "$INPUT" | jq -r '.tool_input.cli_command[] | select(contains("--profile read-only") | not)')
  if [ -n "$BAD_CMD" ]; then
    echo "🔴 차단: AWS MCP 호출 시 반드시 '--profile read-only'를 사용해야 합니다." >&2
    exit 2
  fi
else
  if ! echo "$COMMAND" | grep -q '\-\-profile read-only'; then
    echo "🔴 차단: AWS MCP 호출 시 반드시 '--profile read-only'를 사용해야 합니다." >&2
    exit 2
  fi
fi

exit 0
