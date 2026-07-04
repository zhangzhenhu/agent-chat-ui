#!/usr/bin/env bash
# 复用脚本：向后端 family_main graph 发起一次 stream run，抓 SSE 落盘分析。
# 用法: ./scripts/thinking-stream.sh ["你的提问内容"]
#
# 依赖: curl, python3。后端需在 http://localhost:2025 。
set -euo pipefail

BASE_URL="${BACKEND_URL:-http://localhost:2025}"
QUESTION="${1:-我家三口人，想安排这周晚饭，要省钱}"
OUT="${THINKING_SSE_OUT:-/tmp/thinking_sse.txt}"

# 复用已建的 family_main_dbg assistant；不存在则新建。
ASST_ID="${FAMILY_MAIN_ASSISTANT_ID:-fbefca83-f9df-4ba0-9ef5-1b0749f5cf0d}"
if ! curl -sf -m 5 -o /dev/null "${BASE_URL}/assistants/${ASST_ID}"; then
  ASST_ID=$(curl -s -m 10 -X POST "${BASE_URL}/assistants" \
    -H 'content-type: application/json' \
    -d '{"graph_id":"family_main","name":"family_main_dbg"}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['assistant_id'])")
  echo "created assistant_id=$ASST_ID" >&2
fi

# 每次新建 thread，避免历史污染。
THREAD_ID=$(curl -s -m 5 -X POST "${BASE_URL}/threads" \
  -H 'content-type: application/json' -d '{}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['thread_id'])")
echo "thread_id=$THREAD_ID assistant_id=$ASST_ID" >&2

# stream_mode: custom=thinking 自定义事件; updates=durable UI 帧(含 ui 数组)。
curl -s -m 120 -N -X POST "${BASE_URL}/threads/${THREAD_ID}/runs/stream" \
  -H 'content-type: application/json' \
  -d "{\"assistant_id\":\"${ASST_ID}\",\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"${QUESTION}\"}]},\"stream_mode\":[\"custom\",\"updates\"]}" \
  -o "${OUT}"
echo "saved -> ${OUT} ($(wc -c < "${OUT}") bytes, $(wc -l < "${OUT}") lines)" >&2
