#!/bin/sh
# 지도 검증용 실행 래퍼 — 서버를 띄우고(이미 떠 있으면 그대로) 인자로 준 명령을 실행한 뒤 내린다.
#   사용: scripts/with-dev.sh python3 scripts/verify-zoom-sync.py
#   MODE=prod scripts/with-dev.sh python3 scripts/verify-zoom-sync.py   (빌드된 .next 로 next start)
set -u
export PATH=/workspace/.tooling/node/bin:$PATH
export LD_LIBRARY_PATH=/workspace/.tooling/libs/extracted/usr/lib/x86_64-linux-gnu
PORT=3100
cd "$(dirname "$0")/.." || exit 1

started=0
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  if [ "${MODE:-dev}" = "prod" ]; then
    node node_modules/next/dist/bin/next start -p "$PORT" > /tmp/next.log 2>&1 &
  else
    node node_modules/next/dist/bin/next dev -p "$PORT" > /tmp/next.log 2>&1 &
  fi
  PID=$!
  started=1
  i=0
  while [ $i -lt 90 ]; do
    if curl -s -o /dev/null "http://localhost:$PORT/"; then break; fi
    sleep 1
    i=$((i + 1))
  done
fi

"$@"
STATUS=$?

if [ "$started" = "1" ]; then kill "$PID" 2>/dev/null; fi
exit $STATUS
